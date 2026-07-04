// ============================================
// NODA MINGIR POS SYSTEM
// Connected to Google Sheets via Apps Script
// ============================================

const APP_NAME = 'NodaMingirPOS';
const DEFAULT_PASSWORD = 'admin123';

// State
let currentUser = null;
let orders = [];
let services = [];
let settings = {};
let selectedServices = new Set();

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadLocalData();

  // Check if already logged in
  if (localStorage.getItem(`${APP_NAME}_session`)) {
    showPOS();
  }

  // Load services for selector
  renderServiceSelector();

  // Enter key on login
  document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  // Populate settings fields
  if (settings.gasUrl) {
    document.getElementById('gasUrl').value = settings.gasUrl;
  }
});

// ============================================
// AUTH
// ============================================
function doLogin() {
  const input = document.getElementById('loginPassword').value;
  const savedPassword = settings.password || DEFAULT_PASSWORD;

  if (input === savedPassword) {
    localStorage.setItem(`${APP_NAME}_session`, 'true');
    showPOS();
    showToast('Berhasil masuk!', 'success');
  } else {
    showToast('Password salah!', 'error');
  }
}

function doLogout() {
  localStorage.removeItem(`${APP_NAME}_session`);
  location.reload();
}

function showPOS() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('posLayout').style.display = 'flex';
  refreshData();
}

// ============================================
// NAVIGATION
// ============================================
function showSection(sectionId, el) {
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.getElementById(sectionId).classList.add('active');

  // Update nav active state
  if (el) {
    document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));
    el.classList.add('active');
  }

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');

  // Refresh data for specific sections
  if (sectionId === 'dashboard') updateDashboard();
  if (sectionId === 'orders') renderOrdersTable();
  if (sectionId === 'services') renderServicesList();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============================================
// DATA MANAGEMENT
// ============================================
function loadSettings() {
  const saved = localStorage.getItem(`${APP_NAME}_settings`);
  settings = saved ? JSON.parse(saved) : {};
}

function saveSettings() {
  const gasUrl = document.getElementById('gasUrl').value.trim();
  const newPassword = document.getElementById('posPassword').value.trim();

  if (gasUrl) settings.gasUrl = gasUrl;
  if (newPassword) settings.password = newPassword;

  localStorage.setItem(`${APP_NAME}_settings`, JSON.stringify(settings));
  showToast('Pengaturan disimpan!', 'success');
  document.getElementById('posPassword').value = '';
}

function loadLocalData() {
  const savedOrders = localStorage.getItem(`${APP_NAME}_orders`);
  const savedServices = localStorage.getItem(`${APP_NAME}_services`);

  orders = savedOrders ? JSON.parse(savedOrders) : getDefaultOrders();
  services = savedServices ? JSON.parse(savedServices) : getDefaultServices();
}

function saveLocalData() {
  localStorage.setItem(`${APP_NAME}_orders`, JSON.stringify(orders));
  localStorage.setItem(`${APP_NAME}_services`, JSON.stringify(services));
}

function getDefaultServices() {
  return [
    { id: 1, name: 'Deep Clean', price: 50000, description: 'Pencucian menyeluruh in & out' },
    { id: 2, name: 'Express Clean', price: 35000, description: 'Cepat 3 jam' },
    { id: 3, name: 'Unyellowing', price: 40000, description: 'Hilangkan noda kuning midsole' },
    { id: 4, name: 'Repaint', price: 75000, description: 'Repaint upper custom' },
    { id: 5, name: 'Leather Care', price: 60000, description: 'Perawatan kulit' },
    { id: 6, name: 'Box & Sole', price: 45000, description: 'Box & sole treatment' }
  ];
}

function getDefaultOrders() {
  return [];
}

// ============================================
// GOOGLE APPS SCRIPT API
// ============================================
async function callGAS(action, data = {}) {
  if (!settings.gasUrl) {
    console.warn('GAS URL not configured');
    return { success: false, error: 'GAS URL not configured' };
  }

  try {
    const response = await fetch(settings.gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action, ...data }),
      headers: { 'Content-Type': 'application/json' }
    });
    return await response.json();
  } catch (err) {
    console.error('GAS Error:', err);
    return { success: false, error: err.message };
  }
}

async function refreshData() {
  showLoading(true);

  if (settings.gasUrl) {
    // Try to sync with Google Sheets
    const result = await callGAS('getData');
    if (result.success) {
      if (result.orders) orders = result.orders;
      if (result.services) services = result.services;
      saveLocalData();
      updateSyncStatus(true);
    } else {
      updateSyncStatus(false);
      showToast('Gagal sinkron dengan Google Sheets. Menggunakan data lokal.', 'warning');
    }
  } else {
    updateSyncStatus(false);
  }

  updateDashboard();
  renderServiceSelector();
  renderOrdersTable();
  showLoading(false);
}

function updateSyncStatus(online) {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncText');
  if (dot && text) {
    dot.classList.toggle('offline', !online);
    text.textContent = online ? 'Online' : 'Offline';
  }
}

// ============================================
// DASHBOARD
// ============================================
function updateDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o.date && o.date.startsWith(today));

  const totalOrders = todayOrders.length;
  const revenue = todayOrders.reduce((sum, o) => sum + (parseInt(o.total) || 0), 0);
  const pending = todayOrders.filter(o => o.status === 'Pending').length;
  const completed = todayOrders.filter(o => o.status === 'Completed').length;

  document.getElementById('statTotalOrders').textContent = totalOrders;
  document.getElementById('statRevenue').textContent = formatRupiah(revenue);
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statCompleted').textContent = completed;

  // Recent orders table
  const recent = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const tbody = document.querySelector('#recentOrdersTable tbody');
  tbody.innerHTML = recent.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${o.customerName}</td>
      <td>${o.serviceNames || '-'}</td>
      <td>${formatRupiah(o.total)}</td>
      <td>${statusBadge(o.status)}</td>
    </tr>
  `).join('');
}

// ============================================
// NEW ORDER
// ============================================
function renderServiceSelector() {
  const container = document.getElementById('serviceSelector');
  if (!container) return;

  container.innerHTML = services.map(s => `
    <div class="service-option" data-id="${s.id}" onclick="toggleService(${s.id}, this)">
      <h4>${s.name}</h4>
      <div class="price">${formatRupiah(s.price)}</div>
    </div>
  `).join('');
}

function toggleService(id, el) {
  if (selectedServices.has(id)) {
    selectedServices.delete(id);
    el.classList.remove('selected');
  } else {
    selectedServices.add(id);
    el.classList.add('selected');
  }
  calculateTotal();
}

function calculateTotal() {
  let total = 0;
  selectedServices.forEach(id => {
    const svc = services.find(s => s.id === id);
    if (svc) total += svc.price;
  });
  document.getElementById('orderTotal').textContent = formatRupiah(total);
}

async function submitOrder() {
  const customerName = document.getElementById('customerName').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();

  if (!customerName || !customerPhone) {
    showToast('Nama dan nomor WhatsApp wajib diisi!', 'error');
    return;
  }

  if (selectedServices.size === 0) {
    showToast('Pilih minimal satu layanan!', 'error');
    return;
  }

  const selectedServiceList = Array.from(selectedServices).map(id => services.find(s => s.id === id));
  const total = selectedServiceList.reduce((sum, s) => sum + s.price, 0);

  const newOrder = {
    id: generateId(),
    date: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
    customerName,
    customerPhone,
    shoeBrand: document.getElementById('shoeBrand').value.trim(),
    shoeSize: document.getElementById('shoeSize').value.trim(),
    shoeColor: document.getElementById('shoeColor').value.trim(),
    shoeCondition: document.getElementById('shoeCondition').value,
    serviceIds: Array.from(selectedServices),
    serviceNames: selectedServiceList.map(s => s.name).join(', '),
    total,
    status: 'Pending',
    notes: document.getElementById('orderNotes').value.trim()
  };

  // Save locally first
  orders.push(newOrder);
  saveLocalData();

  // Try sync to GAS
  if (settings.gasUrl) {
    const result = await callGAS('addOrder', { order: newOrder });
    if (!result.success) {
      showToast('Order tersimpan lokal. Sinkron GAS gagal.', 'warning');
    } else {
      showToast('Order berhasil disimpan!', 'success');
    }
  } else {
    showToast('Order tersimpan secara lokal.', 'success');
  }

  // Reset form
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('shoeBrand').value = '';
  document.getElementById('shoeSize').value = '';
  document.getElementById('shoeColor').value = '';
  document.getElementById('orderNotes').value = '';
  selectedServices.clear();
  renderServiceSelector();
  calculateTotal();

  // Go to orders
  showSection('orders', document.querySelector('.nav-menu a:nth-child(3)'));
  renderOrdersTable();
}

// ============================================
// ORDERS LIST
// ============================================
let currentFilter = 'all';

function renderOrdersTable() {
  const tbody = document.querySelector('#ordersTable tbody');
  if (!tbody) return;

  let filtered = [...orders];

  // Status filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter(o => o.status === currentFilter);
  }

  // Search filter
  const search = document.getElementById('orderSearch')?.value.toLowerCase() || '';
  if (search) {
    filtered = filtered.filter(o =>
      o.customerName?.toLowerCase().includes(search) ||
      o.shoeBrand?.toLowerCase().includes(search) ||
      o.id?.toString().includes(search)
    );
  }

  // Sort by date desc
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  tbody.innerHTML = filtered.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${formatDate(o.date)}</td>
      <td>
        <strong>${o.customerName}</strong><br>
        <small class="text-muted">${o.customerPhone}</small>
      </td>
      <td>${o.shoeBrand || '-'} <small class="text-muted">(${o.shoeSize || '-'})</small></td>
      <td>${o.serviceNames || '-'}</td>
      <td><strong>${formatRupiah(o.total)}</strong></td>
      <td>${statusSelect(o)}</td>
      <td>
        <button class="action-btn" onclick="viewOrder('${o.id}')" title="Detail">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
        <button class="action-btn delete" onclick="deleteOrder('${o.id}')" title="Hapus">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

function statusSelect(order) {
  const statuses = ['Pending', 'Processing', 'Done', 'Completed'];
  const options = statuses.map(s =>
    `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`
  ).join('');
  return `<select class="status-select" onchange="updateStatus('${order.id}', this.value)">${options}</select>`;
}

function statusBadge(status) {
  const map = {
    'Pending': 'badge-pending',
    'Processing': 'badge-processing',
    'Done': 'badge-done',
    'Completed': 'badge-completed'
  };
  return `<span class="badge ${map[status] || 'badge-pending'}">${status}</span>`;
}

async function updateStatus(id, newStatus) {
  const order = orders.find(o => o.id === id);
  if (!order) return;

  order.status = newStatus;
  saveLocalData();

  if (settings.gasUrl) {
    await callGAS('updateOrder', { id, status: newStatus });
  }

  showToast(`Status diupdate ke ${newStatus}`, 'success');
  updateDashboard();
}

function filterByStatus(status, btn) {
  currentFilter = status;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrdersTable();
}

function filterOrders() {
  renderOrdersTable();
}

function viewOrder(id) {
  const order = orders.find(o => o.id === id);
  if (!order) return;

  alert(`Detail Order #${order.id}

Pelanggan: ${order.customerName}
WhatsApp: ${order.customerPhone}
Sepatu: ${order.shoeBrand || '-'} (${order.shoeSize || '-'})
Warna: ${order.shoeColor || '-'}
Kondisi: ${order.shoeCondition || '-'}
Layanan: ${order.serviceNames}
Total: ${formatRupiah(order.total)}
Status: ${order.status}
Catatan: ${order.notes || '-'}`);
}

async function deleteOrder(id) {
  if (!confirm('Yakin hapus order ini?')) return;

  orders = orders.filter(o => o.id !== id);
  saveLocalData();

  if (settings.gasUrl) {
    await callGAS('deleteOrder', { id });
  }

  showToast('Order dihapus', 'success');
  renderOrdersTable();
  updateDashboard();
}

// ============================================
// SERVICES MANAGEMENT
// ============================================
function renderServicesList() {
  const container = document.getElementById('servicesList');
  if (!container) return;

  container.innerHTML = services.map(s => `
    <div class="service-row">
      <div class="service-info">
        <h4>${s.name}</h4>
        <p>${s.description || '-'}</p>
      </div>
      <div class="service-price-tag">${formatRupiah(s.price)}</div>
      <div class="service-actions">
        <button class="action-btn" onclick="editService(${s.id})" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-btn delete" onclick="deleteService(${s.id})" title="Hapus">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

let editingServiceId = null;

function openServiceModal() {
  editingServiceId = null;
  document.getElementById('serviceModalTitle').textContent = 'Tambah Layanan';
  document.getElementById('serviceName').value = '';
  document.getElementById('servicePrice').value = '';
  document.getElementById('serviceDesc').value = '';
  document.getElementById('serviceModal').classList.add('active');
}

function closeServiceModal() {
  document.getElementById('serviceModal').classList.remove('active');
}

function editService(id) {
  const svc = services.find(s => s.id === id);
  if (!svc) return;

  editingServiceId = id;
  document.getElementById('serviceModalTitle').textContent = 'Edit Layanan';
  document.getElementById('serviceName').value = svc.name;
  document.getElementById('servicePrice').value = svc.price;
  document.getElementById('serviceDesc').value = svc.description || '';
  document.getElementById('serviceModal').classList.add('active');
}

async function saveService() {
  const name = document.getElementById('serviceName').value.trim();
  const price = parseInt(document.getElementById('servicePrice').value) || 0;
  const description = document.getElementById('serviceDesc').value.trim();

  if (!name || price <= 0) {
    showToast('Nama dan harga wajib diisi!', 'error');
    return;
  }

  if (editingServiceId) {
    const svc = services.find(s => s.id === editingServiceId);
    if (svc) {
      svc.name = name;
      svc.price = price;
      svc.description = description;
    }
  } else {
    services.push({
      id: generateId(),
      name,
      price,
      description
    });
  }

  saveLocalData();

  if (settings.gasUrl) {
    await callGAS('saveServices', { services });
  }

  closeServiceModal();
  renderServicesList();
  renderServiceSelector();
  showToast('Layanan disimpan!', 'success');
}

async function deleteService(id) {
  if (!confirm('Yakin hapus layanan ini?')) return;
  services = services.filter(s => s.id !== id);
  saveLocalData();

  if (settings.gasUrl) {
    await callGAS('saveServices', { services });
  }

  renderServicesList();
  renderServiceSelector();
  showToast('Layanan dihapus', 'success');
}

// ============================================
// UTILITIES
// ============================================
function generateId() {
  return Date.now().toString(36).toUpperCase();
}

function formatRupiah(num) {
  return 'Rp ' + (num || 0).toLocaleString('id-ID');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' :
        type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
    </svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.toggle('hidden', !show);
}

function exportData() {
  const csv = convertToCSV(orders);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `noda-mingir-orders-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data diexport!', 'success');
}

function convertToCSV(data) {
  if (!data.length) return '';
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row =>
    Object.values(row).map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [headers, ...rows].join('\n');
}

function clearLocalData() {
  if (!confirm('Yakin hapus semua data lokal? Data tidak bisa dikembalikan.')) return;
  orders = [];
  services = getDefaultServices();
  saveLocalData();
  updateDashboard();
  renderOrdersTable();
  renderServicesList();
  showToast('Data lokal dihapus', 'success');
}
