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
  const [invSearch, setInvSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')
  const [sortBy, setSortBy] = useState('name')
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [itemForm, setItemForm]
