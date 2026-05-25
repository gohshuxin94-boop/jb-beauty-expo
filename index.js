import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Skincare', 'Makeup', 'Haircare', 'Fragrance', 'Body Care', 'Tools & Accessories']
const LOW = 10
const getStatus = (qty) => qty === 0 ? 'out' : qty <= LOW ? 'low' : 'in'

const STATUS_CFG = {
  out: { bg: '#FCEBEB', color: '#A32D2D', label: '缺货',   icon: '✕' },
  low: { bg: '#FAEEDA', color: '#854F0B', label: '库存少', icon: '⚠' },
  in:  { bg: '#EAF3DE', color: '#3B6D11', label: '正常',   icon: '✓' },
}

const PAY_CFG = {
  cash: { label: '现金',   bg: '#EAF3DE', color: '#3B6D11' },
  card: { label: '刷卡',   bg: '#E6F1FB', color: '#185FA5' },
  qr:   { label: 'QR Pay', bg: '#FBEAF0', color: '#993556' },
}

const CAT_ICONS = {
  'Skincare': '💧', 'Makeup': '🎨', 'Haircare': '💨',
  'Fragrance': '✨', 'Body Care': '🌸', 'Tools & Accessories': '🔧',
}

function Badge({ children, bg, color }) {
  return (
    <span style={{ background: bg, color, fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, display: 'inline-block', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

function StatusBadge({ qty }) {
  const s = STATUS_CFG[getStatus(qty)]
  return <Badge bg={s.bg} color={s.color}>{s.icon} {s.label}</Badge>
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('zh-MY', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('zh-MY', { hour: '2-digit', minute: '2-digit' })
}

function genOrderNo() {
  return 'ORD-' + Date.now().toString().slice(-6)
}

const EMPTY_ITEM = { name: '', brand: '', category: 'Skincare', price: '', qty: '', sku: '' }

export default function Home() {
  const [tab, setTab] = useState('inventory')
  const [items, setItems] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // inventory ui state
  const [invSearch, setInvSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [itemForm, setItemForm] = useState(EMPTY_ITEM)
  const [itemErrors, setItemErrors] = useState({})
  const itemFormRef = useRef(null)

  // order ui state
  const [orderFormOpen, setOrderFormOpen] = useState(false)
  const [customer, setCustomer] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [orderLines, setOrderLines] = useState([{ productId: '', qty: 1 }])
  const [orderNote, setOrderNote] = useState('')
  const [orderErrors, setOrderErrors] = useState({})
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [orderSearch, setOrderSearch] = useState('')
  const orderFormRef = useRef(null)

  // ── Load data ──
  useEffect(() => {
    loadAll()

    // Realtime sync
    const itemsSub = supabase.channel('items-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => loadItems())
      .subscribe()

    const ordersSub = supabase.channel('orders-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .subscribe()

    return () => {
      supabase.removeChannel(itemsSub)
      supabase.removeChannel(ordersSub)
    }
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadItems(), loadOrders()])
    setLoading(false)
  }

  async function loadItems() {
    const { data } = await supabase.from('items').select('*').order('name')
    if (data) setItems(data)
  }

  async function loadOrders() {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (data) setOrders(data)
  }

  // ── Item CRUD ──
  const filteredItems = items
    .filter(i => {
      const q = invSearch.toLowerCase()
      return (i.name.toLowerCase().includes(q) || i.brand.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)) &&
        (filterCat === 'All' || i.category === filterCat)
    })
    .sort((a, b) => sortBy === 'qty' ? a.qty - b.qty : sortBy === 'price' ? b.price - a.price : a.name.localeCompare(b.name))

  const openAddItem = () => {
    setItemForm(EMPTY_ITEM); setEditId(null); setItemErrors({}); setItemFormOpen(true)
    setTimeout(() => itemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const openEditItem = (item) => {
    setItemForm({ name: item.name, brand: item.brand, category: item.category, price: String(item.price), qty: String(item.qty), sku: item.sku || '' })
    setEditId(item.id); setItemErrors({}); setItemFormOpen(true)
    setTimeout(() => itemFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const validateItem = () => {
    const e = {}
    if (!itemForm.name.trim()) e.name = '必填'
    if (!itemForm.brand.trim()) e.brand = '必填'
    if (!itemForm.price || isNaN(itemForm.price) || Number(itemForm.price) < 0) e.price = '请输入有效价格'
    if (!itemForm.qty || isNaN(itemForm.qty) || Number(itemForm.qty) < 0 || !Number.isInteger(Number(itemForm.qty))) e.qty = '请输入整数'
    return e
  }

  const saveItem = async () => {
    const e = validateItem()
    if (Object.keys(e).length) { setItemErrors(e); return }
    setSyncing(true)
    const payload = { name: itemForm.name.trim(), brand: itemForm.brand.trim(), category: itemForm.category, price: Number(itemForm.price), qty: Number(itemForm.qty), sku: itemForm.sku.trim() || `SKU-${Date.now().toString().slice(-5)}` }
    if (editId) {
      await supabase.from('items').update(payload).eq('id', editId)
    } else {
      await supabase.from('items').insert(payload)
    }
    await loadItems()
    setSyncing(false)
    setItemFormOpen(false); setEditId(null)
  }

  const deleteItem = async (id) => {
    if (!window.confirm('确认删除此产品？')) return
    setSyncing(true)
    await supabase.from('items').delete().eq('id', id)
    await loadItems()
    setSyncing(false)
  }

  const adjustQty = async (item, delta) => {
    const newQty = Math.max(0, item.qty + delta)
    setSyncing(true)
    await supabase.from('items').update({ qty: newQty }).eq('id', item.id)
    await loadItems()
    setSyncing(false)
  }

  // ── Order CRUD ──
  const addLine = () => setOrderLines(prev => [...prev, { productId: '', qty: 1 }])
  const removeLine = (idx) => setOrderLines(prev => prev.filter((_, i) => i !== idx))
  const updateLine = (idx, field, val) => setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))

  const orderTotal = orderLines.reduce((sum, l) => {
    const prod = items.find(i => String(i.id) === String(l.productId))
    return sum + (prod ? prod.price * Number(l.qty || 0) : 0)
  }, 0)

  const openOrderForm = () => {
    setCustomer(''); setCustomerPhone(''); setPayMethod('cash')
    setOrderLines([{ productId: '', qty: 1 }]); setOrderNote(''); setOrderErrors({})
    setOrderFormOpen(true)
    setTimeout(() => orderFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const validateOrder = () => {
    const e = {}
    if (!customer.trim()) e.customer = '请输入顾客姓名'
    const validLines = orderLines.filter(l => l.productId)
    if (!validLines.length) e.lines = '至少选一件产品'
    for (const l of validLines) {
      const prod = items.find(i => String(i.id) === String(l.productId))
      if (!prod) continue
      if (Number(l.qty) < 1) { e.lines = '数量最少为1'; break }
      if (Number(l.qty) > prod.qty) { e.lines = `"${prod.name}" 库存不足（剩余 ${prod.qty}）`; break }
    }
    return e
  }

  const placeOrder = async () => {
    const e = validateOrder()
    if (Object.keys(e).length) { setOrderErrors(e); return }
    setSyncing(true)

    const validLines = orderLines.filter(l => l.productId && Number(l.qty) >= 1)
    const lineDetails = validLines.map(l => {
      const prod = items.find(i => String(i.id) === String(l.productId))
      return { productId: prod.id, name: prod.name, sku: prod.sku, price: prod.price, qty: Number(l.qty), subtotal: prod.price * Number(l.qty) }
    })
    const total = lineDetails.reduce((s, l) => s + l.subtotal, 0)

    await supabase.from('orders').insert({
      order_no: genOrderNo(),
      customer: customer.trim(),
      phone: customerPhone.trim(),
      payment: payMethod,
      lines: lineDetails,
      total,
      note: orderNote.trim(),
    })

    // Deduct inventory
    for (const l of lineDetails) {
      const prod = items.find(i => i.id === l.productId)
      if (prod) await supabase.from('items').update({ qty: prod.qty - l.qty }).eq('id', prod.id)
    }

    await Promise.all([loadItems(), loadOrders()])
    setSyncing(false)
    setOrderFormOpen(false)
  }

  const deleteOrder = async (order) => {
    if (!window.confirm(`确认删除 ${order.order_no}？库存将会还原。`)) return
    setSyncing(true)
    await supabase.from('orders').delete().eq('id', order.id)
    // Restore inventory
    for (const l of order.lines) {
      const prod = items.find(i => i.id === l.productId)
      if (prod) await supabase.from('items').update({ qty: prod.qty + l.qty }).eq('id', prod.id)
    }
    await Promise.all([loadItems(), loadOrders()])
    setSyncing(false)
  }

  const filteredOrders = orders.filter(o => {
    const q = orderSearch.toLowerCase()
    return o.customer.toLowerCase().includes(q) || o.order_no.toLowerCase().includes(q) || o.lines.some(l => l.name.toLowerCase().includes(q))
  })

  const todayRevenue = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).reduce((s, o) => s + o.total, 0)
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const alertCount = items.filter(i => getStatus(i.qty) !== 'in').length

  // ─── Styles ───
  const s = {
    container: { fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 960, margin: '0 auto', padding: '24px 16px', color: '#1a1a1a' },
    card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' },
    statCard: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' },
    btn: { padding: '8px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontFamily: 'inherit' },
    btnPrimary: { padding: '9px 18px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer', border: 'none', background: '#D4537E', color: '#fff', fontFamily: 'inherit' },
    input: { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' },
    label: { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 },
    th: { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6b7280', letterSpacing: '0.07em', textTransform: 'uppercase' },
    td: { padding: '10px 12px', fontSize: 13 },
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui', color: '#6b7280' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
        <p>载入中...</p>
      </div>
    </div>
  )

  return (
    <>
      <Head>
        <title>JB Beauty Expo 2026 — 库存管理</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`body{margin:0;background:#f3f4f6} input:focus,select:focus{outline:2px solid #D4537E;outline-offset:1px} * {box-sizing:border-box}`}</style>
      </Head>

      <div style={s.container}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>✨ JB Beauty Expo 2026</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>管理系统</h1>
            {syncing && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#D4537E' }}>⟳ 同步中...</p>}
          </div>
          {tab === 'inventory'
            ? <button style={s.btnPrimary} onClick={openAddItem}>＋ 添加产品</button>
            : <button style={s.btnPrimary} onClick={openOrderForm}>＋ 新增记录</button>
          }
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
          {[
            { key: 'inventory', label: '📦 库存管理', badge: alertCount },
            { key: 'orders', label: '👤 顾客拿货记录', badge: 0 },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none', borderBottom: tab === t.key ? '2px solid #D4537E' : '2px solid transparent', background: 'transparent', color: tab === t.key ? '#D4537E' : '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
              {t.label}
              {t.badge > 0 && <span style={{ background: '#D4537E', color: '#fff', borderRadius: 20, fontSize: 10, padding: '1px 6px', fontWeight: 600 }}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ══ INVENTORY TAB ══ */}
        {tab === 'inventory' && (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: '总产品数', value: items.length, color: '#D4537E' },
                { label: '总库存量', value: items.reduce((s, i) => s + i.qty, 0), color: '#185FA5' },
                { label: '需关注', value: alertCount, color: alertCount > 0 ? '#854F0B' : '#3B6D11' },
                { label: '库存总值', value: `RM ${items.reduce((s, i) => s + i.qty * i.price, 0).toLocaleString()}`, color: '#3B6D11' },
              ].map(st => (
                <div key={st.label} style={s.statCard}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280' }}>{st.label}</p>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: st.color }}>{st.value}</p>
                </div>
              ))}
            </div>

            {/* Category filter */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {['All', ...CATEGORIES].map(c => (
                <button key={c} onClick={() => setFilterCat(c)} style={{ padding: '4px 12px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: '1px solid', background: filterCat === c ? '#D4537E' : 'transparent', color: filterCat === c ? '#fff' : '#6b7280', borderColor: filterCat === c ? '#D4537E' : '#d1d5db' }}>
                  {c === 'All' ? '全部' : `${CAT_ICONS[c]} ${c}`}
                </button>
              ))}
            </div>

            {/* Search & sort */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={{ ...s.input, flex: 1 }} placeholder="搜索产品名、品牌、SKU..." value={invSearch} onChange={e => setInvSearch(e.target.value)} />
              <select style={{ ...s.input, width: 'auto' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="name">按名称</option>
                <option value="qty">按库存</option>
                <option value="price">按价格</option>
              </select>
            </div>

            {/* Item form */}
            {itemFormOpen && (
              <div ref={itemFormRef} style={{ ...s.card, padding: 20, marginBottom: 12, borderLeft: '3px solid #D4537E' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{editId ? '✏️ 编辑产品' : '➕ 添加新产品'}</h3>
                  <button style={s.btn} onClick={() => setItemFormOpen(false)}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  {[{ label: '产品名称 *', key: 'name', type: 'text', ph: 'Laneige Lip Mask' }, { label: '品牌 *', key: 'brand', type: 'text', ph: 'Laneige' }, { label: 'SKU', key: 'sku', type: 'text', ph: 'LAN-001' }, { label: '单价 RM *', key: 'price', type: 'number', ph: '0.00' }, { label: '库存数量 *', key: 'qty', type: 'number', ph: '0' }].map(f => (
                    <div key={f.key}>
                      <label style={s.label}>{f.label}</label>
                      <input style={{ ...s.input, borderColor: itemErrors[f.key] ? '#ef4444' : '#d1d5db' }} type={f.type} placeholder={f.ph} value={itemForm[f.key]} min={f.type === 'number' ? 0 : undefined} onChange={e => { setItemForm(p => ({ ...p, [f.key]: e.target.value })); setItemErrors(p => ({ ...p, [f.key]: undefined })) }} />
                      {itemErrors[f.key] && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#ef4444' }}>{itemErrors[f.key]}</p>}
                    </div>
                  ))}
                  <div>
                    <label style={s.label}>分类 *</label>
                    <select style={s.input} value={itemForm.category} onChange={e => setItemForm(p => ({ ...p, category: e.target.value }))}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button style={s.btn} onClick={() => setItemFormOpen(false)}>取消</button>
                  <button style={s.btnPrimary} onClick={saveItem}>{editId ? '✓ 保存更改' : '＋ 添加产品'}</button>
                </div>
              </div>
            )}

            {/* Inventory table */}
            <div style={s.card}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['产品名称', '品牌', '分类', '单价 (RM)', '库存', '状态', ''].map((h, i) => <th key={i} style={s.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '2.5rem', textAlign: 'center', color: '#9ca3af' }}>😶 没有找到产品</td></tr>
                  ) : filteredItems.map((item, idx) => (
                    <tr key={item.id} style={{ borderBottom: idx < filteredItems.length - 1 ? '1px solid #f3f4f6' : 'none', background: getStatus(item.qty) === 'out' ? '#fff5f5' : undefined }}>
                      <td style={s.td}>
                        <p style={{ margin: 0, fontWeight: 500 }}>{item.name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>{item.sku}</p>
                      </td>
                      <td style={{ ...s.td, color: '#6b7280' }}>{item.brand}</td>
                      <td style={s.td}><span style={{ fontSize: 11, background: '#f3f4f6', padding: '2px 8px', borderRadius: 20 }}>{CAT_ICONS[item.category]} {item.category}</span></td>
                      <td style={{ ...s.td, fontWeight: 500 }}>{Number(item.price).toFixed(2)}</td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button style={{ ...s.btn, padding: '2px 8px' }} onClick={() => adjustQty(item, -1)}>−</button>
                          <span style={{ fontWeight: 600, minWidth: 28, textAlign: 'center' }}>{item.qty}</span>
                          <button style={{ ...s.btn, padding: '2px 8px' }} onClick={() => adjustQty(item, 1)}>＋</button>
                        </div>
                      </td>
                      <td style={s.td}><StatusBadge qty={item.qty} /></td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={s.btn} onClick={() => openEditItem(item)} title="编辑">✏️</button>
                          <button style={{ ...s.btn, color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => deleteItem(item.id)} title="删除">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap', gap: 4 }}>
              <span>显示 {filteredItems.length} / {items.length} 件产品</span>
              {alertCount > 0 && <span style={{ color: '#854F0B' }}>⚠ {alertCount} 件产品需要补货</span>}
            </div>
          </>
        )}

        {/* ══ ORDERS TAB ══ */}
        {tab === 'orders' && (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: '总记录数', value: orders.length, color: '#D4537E' },
                { label: '今日销售额', value: `RM ${todayRevenue.toLocaleString()}`, color: '#185FA5' },
                { label: '累计销售额', value: `RM ${totalRevenue.toLocaleString()}`, color: '#3B6D11' },
                { label: '顾客数', value: new Set(orders.map(o => o.customer)).size, color: '#854F0B' },
              ].map(st => (
                <div key={st.label} style={s.statCard}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280' }}>{st.label}</p>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 600, color: st.color }}>{st.value}</p>
                </div>
              ))}
            </div>

            {/* Order form */}
            {orderFormOpen && (
              <div ref={orderFormRef} style={{ ...s.card, padding: 20, marginBottom: 12, borderLeft: '3px solid #D4537E' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>👤 新增顾客拿货记录</h3>
                  <button style={s.btn} onClick={() => setOrderFormOpen(false)}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={s.label}>顾客姓名 *</label>
                    <input style={{ ...s.input, borderColor: orderErrors.customer ? '#ef4444' : '#d1d5db' }} placeholder="e.g. Siti Aminah" value={customer} onChange={e => { setCustomer(e.target.value); setOrderErrors(p => ({ ...p, customer: undefined })) }} />
                    {orderErrors.customer && <p style={{ margin: '3px 0 0', fontSize: 11, color: '#ef4444' }}>{orderErrors.customer}</p>}
                  </div>
                  <div>
                    <label style={s.label}>联络电话（选填）</label>
                    <input style={s.input} placeholder="e.g. 012-3456789" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={s.label}>付款方式</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {Object.entries(PAY_CFG).map(([k, v]) => (
                      <button key={k} onClick={() => setPayMethod(k)} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer', border: '1px solid', background: payMethod === k ? v.bg : 'transparent', color: payMethod === k ? v.color : '#6b7280', borderColor: payMethod === k ? v.color : '#d1d5db', fontWeight: payMethod === k ? 600 : 400 }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={s.label}>拿货产品 *</label>
                    <button style={{ ...s.btn, fontSize: 12, padding: '4px 10px' }} onClick={addLine}>＋ 加产品</button>
                  </div>
                  {orderErrors.lines && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#ef4444' }}>{orderErrors.lines}</p>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {orderLines.map((line, idx) => {
                      const prod = items.find(i => String(i.id) === String(line.productId))
                      return (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto auto', gap: 8, alignItems: 'center' }}>
                          <select style={s.input} value={line.productId} onChange={e => { updateLine(idx, 'productId', e.target.value); setOrderErrors(p => ({ ...p, lines: undefined })) }}>
                            <option value="">── 选择产品 ──</option>
                            {items.filter(i => i.qty > 0).map(i => <option key={i.id} value={i.id}>{i.name} (剩 {i.qty})</option>)}
                          </select>
                          <input style={{ ...s.input, textAlign: 'center' }} type="number" min={1} max={prod?.qty || 999} value={line.qty} onChange={e => updateLine(idx, 'qty', e.target.value)} />
                          <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', minWidth: 75, textAlign: 'right' }}>{prod ? `RM ${(prod.price * Number(line.qty || 0)).toFixed(2)}` : '—'}</span>
                          {orderLines.length > 1 && <button style={{ ...s.btn, color: '#ef4444', padding: '6px 10px' }} onClick={() => removeLine(idx)}>✕</button>}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>合计：<span style={{ color: '#D4537E', fontSize: 18, fontWeight: 700 }}>RM {orderTotal.toFixed(2)}</span></span>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={s.label}>备注（选填）</label>
                  <input style={s.input} placeholder="e.g. 预留货、换货..." value={orderNote} onChange={e => setOrderNote(e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button style={s.btn} onClick={() => setOrderFormOpen(false)}>取消</button>
                  <button style={s.btnPrimary} onClick={placeOrder}>✓ 确认记录</button>
                </div>
              </div>
            )}

            {/* Search */}
            <input style={{ ...s.input, marginBottom: 12 }} placeholder="搜索顾客姓名、单号、产品..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />

            {/* Orders list */}
            {filteredOrders.length === 0 ? (
              <div style={{ ...s.statCard, padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p>
                <p style={{ margin: 0, fontSize: 14 }}>还没有记录，点击"新增记录"开始</p>
              </div>
            ) : filteredOrders.map(order => (
              <div key={order.id} style={{ ...s.card, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexWrap: 'wrap' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#FBEAF0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, color: '#993556', flexShrink: 0 }}>
                    {order.customer.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{order.customer}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>{order.order_no} · {formatDate(order.created_at)}{order.phone ? ` · ${order.phone}` : ''}</p>
                  </div>
                  <div style={{ flex: 2, minWidth: 150 }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.lines.map(l => `${l.name} ×${l.qty}`).join(' · ')}
                    </p>
                  </div>
                  <Badge bg={PAY_CFG[order.payment].bg} color={PAY_CFG[order.payment].color}>{PAY_CFG[order.payment].label}</Badge>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#D4537E', whiteSpace: 'nowrap' }}>RM {order.total.toFixed(2)}</p>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={s.btn} onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>{expandedOrder === order.id ? '▲' : '▼'}</button>
                    <button style={{ ...s.btn, color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => deleteOrder(order)}>🗑️</button>
                  </div>
                </div>

                {expandedOrder === order.id && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 16px', background: '#f9fafb' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>{['产品', 'SKU', '单价', '数量', '小计'].map(h => <th key={h} style={{ ...s.th, padding: '4px 8px' }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {order.lines.map((l, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 500 }}>{l.name}</td>
                            <td style={{ padding: '6px 8px', color: '#9ca3af', fontSize: 11 }}>{l.sku}</td>
                            <td style={{ padding: '6px 8px' }}>RM {l.price.toFixed(2)}</td>
                            <td style={{ padding: '6px 8px' }}>×{l.qty}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: '#D4537E' }}>RM {l.subtotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{ padding: '8px 8px 0', textAlign: 'right', fontWeight: 500 }}>合计</td>
                          <td style={{ padding: '8px 8px 0', fontWeight: 700, color: '#D4537E', fontSize: 15 }}>RM {order.total.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {order.note && <p style={{ margin: '8px 8px 0', fontSize: 12, color: '#6b7280' }}>📝 备注：{order.note}</p>}
                  </div>
                )}
              </div>
            ))}
            {filteredOrders.length > 0 && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9ca3af' }}>共 {filteredOrders.length} 条记录</p>}
          </>
        )}
      </div>
    </>
  )
}
