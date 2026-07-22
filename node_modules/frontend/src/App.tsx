import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:4000';

interface User { id: number; name: string; email: string; role: string; }

interface Customer {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  businessName: string | null;
  gstNumber: string | null;
  customerType: 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR';
  address: string | null;
  status: 'LEAD' | 'ACTIVE' | 'INACTIVE';
  followUpDate: string | null;
  notes?: CustomerNote[];
}

interface CustomerNote {
  id: number;
  note: string;
  createdAt: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  unitPrice: number;
  currentStock: number;
  minStockAlert: number;
  warehouseLocation: string;
}

interface StockMovement {
  id: number;
  productId: number;
  quantityChanged: number;
  movementType: 'IN' | 'OUT';
  reason: string;
  createdAt: string;
  createdBy: { name: string };
}

interface ChallanItem {
  id: number;
  productId: number;
  productNameSnapshot: string;
  productSkuSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
}

interface Challan {
  id: number;
  challanNumber: string;
  customerId: number;
  customer: Customer;
  totalQuantity: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  items: ChallanItem[];
  createdBy?: User;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setToken(res.data.token);
    setUser(res.data.user);
    navigate('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  // Configure axios defaults
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  return (
    <div className="app-shell">
      <nav className="topbar">
        <div className="brand">Mini ERP Portal</div>
        <div className="nav-user">
          {user && <span className="user-badge">{user.name} ({user.role})</span>}
          {user ? <button className="btn-logout" onClick={logout}>Logout</button> : <Link className="btn-login" to="/login">Login</Link>}
        </div>
      </nav>
      <div className="content">
        {token ? <ProtectedRoutes user={user} /> : <PublicRoutes login={login} />}
      </div>
    </div>
  );
}

function PublicRoutes({ login }: { login: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="login-box">
      <h2>Sign in</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Email Address</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-submit">Login</button>
      </form>
    </div>
  );
}

function ProtectedRoutes({ user }: { user: User | null }) {
  const role = user?.role || 'USER';
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/customers">Customers</Link>
        <Link to="/products">Products</Link>
        <Link to="/challans">Challans</Link>
        {role === 'ADMIN' && <Link to="/admin">Admin Control</Link>}
      </aside>
      <main className="main-panel">
        <Routes>
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/customers" element={<CustomersPage user={user} />} />
          <Route path="/products" element={<ProductsPage user={user} />} />
          <Route path="/challans" element={<ChallansPage user={user} />} />
          <Route path="/admin" element={role === 'ADMIN' ? <AdminPage /> : <Navigate to="/dashboard" />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </main>
    </div>
  );
}

function Dashboard({ user }: { user: User | null }) {
  const [stats, setStats] = useState({ products: 0, customers: 0, challans: 0, lowStock: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [prodRes, custRes, challRes] = await Promise.all([
          axios.get(`${API_URL}/products?limit=100`),
          axios.get(`${API_URL}/customers?limit=100`),
          axios.get(`${API_URL}/challans?limit=100`),
        ]);
        const products = prodRes.data.data || [];
        const lowStock = products.filter((p: Product) => p.currentStock <= p.minStockAlert).length;
        setStats({
          products: prodRes.data.total || 0,
          customers: custRes.data.total || 0,
          challans: challRes.data.total || 0,
          lowStock,
        });
      } catch (err) {
        console.error('Failed to load dashboard metrics:', err);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="dashboard-view">
      <h2>Welcome, {user?.name || 'User'}</h2>
      <p className="role-subtext">Logged in as: <strong>{user?.role}</strong></p>

      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Customers</h3>
          <p className="metric-number">{stats.customers}</p>
        </div>
        <div className="metric-card">
          <h3>Products</h3>
          <p className="metric-number">{stats.products}</p>
        </div>
        <div className="metric-card">
          <h3>Challans</h3>
          <p className="metric-number">{stats.challans}</p>
        </div>
        <div className={`metric-card ${stats.lowStock > 0 ? 'alert' : ''}`}>
          <h3>Low Stock Alert</h3>
          <p className="metric-number">{stats.lowStock}</p>
          {stats.lowStock > 0 && <span className="warning-pill">Restock Needed</span>}
        </div>
      </div>
    </div>
  );
}

function CustomersPage({ user }: { user: User | null }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [newNote, setNewNote] = useState('');

  // Form states
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    businessName: '',
    gstNumber: '',
    customerType: 'RETAIL' as const,
    address: '',
    status: 'LEAD' as const,
    followUpDate: '',
    notes: '',
  });

  const isSalesOrAdmin = user?.role === 'ADMIN' || user?.role === 'SALES';

  const loadCustomers = async () => {
    try {
      const q = [];
      if (search) q.push(`search=${encodeURIComponent(search)}`);
      if (statusFilter) q.push(`status=${statusFilter}`);
      const res = await axios.get(`${API_URL}/customers?${q.join('&')}`);
      setCustomers(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [search, statusFilter]);

  const selectCustomer = async (c: Customer) => {
    try {
      const res = await axios.get(`${API_URL}/customers/${c.id}`);
      setSelected(res.data);
      setNotes(res.data.notes || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/customers`, form);
      setShowCreate(false);
      setForm({
        name: '',
        mobile: '',
        email: '',
        businessName: '',
        gstNumber: '',
        customerType: 'RETAIL',
        address: '',
        status: 'LEAD',
        followUpDate: '',
        notes: '',
      });
      loadCustomers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create customer');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !newNote.trim()) return;
    try {
      const res = await axios.post(`${API_URL}/customers/${selected.id}/notes`, { note: newNote });
      setNotes([res.data, ...notes]);
      setNewNote('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add note');
    }
  };

  return (
    <div className="crud-container">
      <div className="crud-header">
        <h2>Customers</h2>
        {isSalesOrAdmin && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Customer</button>
        )}
      </div>

      <div className="filter-bar">
        <input placeholder="Search name/business/mobile..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="LEAD">Lead</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="split-view">
        <div className="list-panel">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Business</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} onClick={() => selectCustomer(c)} className={selected?.id === c.id ? 'active-row' : ''}>
                  <td>{c.name}</td>
                  <td>{c.businessName || '-'}</td>
                  <td>{c.customerType}</td>
                  <td>
                    <span className={`status-tag ${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="detail-panel">
          {showCreate ? (
            <div className="card-form">
              <h3>New Customer Registration</h3>
              <form onSubmit={handleCreate}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Name *</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Mobile *</label>
                    <input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Business Name</label>
                    <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>GST Number</label>
                    <input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Customer Type</label>
                    <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value as any })}>
                      <option value="RETAIL">Retail</option>
                      <option value="WHOLESALE">Wholesale</option>
                      <option value="DISTRIBUTOR">Distributor</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
                      <option value="LEAD">Lead</option>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Follow up Date</label>
                    <input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Initial Note</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Save Customer</button>
                </div>
              </form>
            </div>
          ) : selected ? (
            <div className="card-detail">
              <h3>{selected.name}</h3>
              <p className="detail-meta">{selected.businessName || 'No Business Name'}</p>
              <div className="detail-grid">
                <div><strong>Mobile:</strong> {selected.mobile}</div>
                <div><strong>Email:</strong> {selected.email || '-'}</div>
                <div><strong>Type:</strong> {selected.customerType}</div>
                <div><strong>Status:</strong> <span className={`status-tag ${selected.status.toLowerCase()}`}>{selected.status}</span></div>
                <div><strong>GSTIN:</strong> {selected.gstNumber || '-'}</div>
                <div><strong>Follow-up:</strong> {selected.followUpDate ? new Date(selected.followUpDate).toLocaleDateString() : '-'}</div>
              </div>
              <div className="detail-address">
                <strong>Address:</strong> {selected.address || 'N/A'}
              </div>

              <div className="timeline-section">
                <h4>Follow-up Notes</h4>
                {isSalesOrAdmin && (
                  <form onSubmit={handleAddNote} className="note-form">
                    <input placeholder="Add follow up progress..." value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                    <button type="submit" className="btn-submit-note">Add Note</button>
                  </form>
                )}
                <div className="timeline">
                  {notes.length === 0 ? <p className="no-data">No follow up history logged.</p> : (
                    notes.map((n) => (
                      <div key={n.id} className="timeline-item">
                        <div className="timeline-date">{new Date(n.createdAt).toLocaleString()}</div>
                        <div className="timeline-content">{n.note}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Select a customer from the table to view files and follow-up timelines.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductsPage({ user }: { user: User | null }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [search, setSearch] = useState('');

  // Form states
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    unitPrice: 0,
    currentStock: 0,
    minStockAlert: 0,
    warehouseLocation: '',
  });

  const [adjustForm, setAdjustForm] = useState({
    quantity: 1,
    movementType: 'IN' as const,
    reason: '',
  });

  const isAdmin = user?.role === 'ADMIN';
  const isWarehouse = user?.role === 'WAREHOUSE';

  const loadProducts = async () => {
    try {
      const res = await axios.get(`${API_URL}/products?search=${encodeURIComponent(search)}`);
      setProducts(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [search]);

  const selectProduct = async (p: Product) => {
    try {
      setSelectedProduct(p);
      const res = await axios.get(`${API_URL}/products/${p.id}/movements`);
      setMovements(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/products`, {
        ...form,
        unitPrice: Number(form.unitPrice),
        currentStock: Number(form.currentStock),
        minStockAlert: Number(form.minStockAlert),
      });
      setShowCreate(false);
      setForm({
        name: '',
        sku: '',
        category: '',
        unitPrice: 0,
        currentStock: 0,
        minStockAlert: 0,
        warehouseLocation: '',
      });
      loadProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create product');
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await axios.post(`${API_URL}/stock-movements`, {
        productId: selectedProduct.id,
        quantityChanged: Number(adjustForm.quantity),
        movementType: adjustForm.movementType,
        reason: adjustForm.reason,
      });
      setShowAdjust(false);
      setAdjustForm({ quantity: 1, movementType: 'IN', reason: '' });
      selectProduct(selectedProduct); // Reload movements
      loadProducts(); // Reload lists
    } catch (err: any) {
      alert(err.response?.data?.error || 'Adjustment failed');
    }
  };

  return (
    <div className="crud-container">
      <div className="crud-header">
        <h2>Products & Inventory</h2>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Add Product</button>
        )}
      </div>

      <div className="filter-bar">
        <input placeholder="Search name/SKU/category..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="split-view">
        <div className="list-panel">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Alert Limit</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isAlert = p.currentStock <= p.minStockAlert;
                return (
                  <tr key={p.id} onClick={() => selectProduct(p)} className={`${selectedProduct?.id === p.id ? 'active-row' : ''} ${isAlert ? 'row-warning' : ''}`}>
                    <td>{p.sku}</td>
                    <td>{p.name}</td>
                    <td>₹{p.unitPrice.toFixed(2)}</td>
                    <td>
                      <span className={isAlert ? 'text-danger font-bold' : ''}>{p.currentStock}</span>
                    </td>
                    <td>{p.minStockAlert}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="detail-panel">
          {showCreate ? (
            <div className="card-form">
              <h3>Create New Product Record</h3>
              <form onSubmit={handleCreate}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Product Name *</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>SKU *</label>
                    <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Category *</label>
                    <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Unit Price (₹) *</label>
                    <input required type="number" min="0" step="any" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Initial Stock *</label>
                    <input required type="number" min="0" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: Number(e.target.value) })} />
                  </div>
                  <div className="form-group">
                    <label>Min Stock Alert Level *</label>
                    <input required type="number" min="0" value={form.minStockAlert} onChange={(e) => setForm({ ...form, minStockAlert: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Warehouse Location *</label>
                  <input required value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Save Product</button>
                </div>
              </form>
            </div>
          ) : selectedProduct ? (
            <div className="card-detail">
              <div className="detail-header-row">
                <div>
                  <h3>{selectedProduct.name}</h3>
                  <p className="detail-meta">SKU: {selectedProduct.sku}</p>
                </div>
                {isWarehouse && (
                  <button className="btn-adjust" onClick={() => setShowAdjust(true)}>Adjust Stock</button>
                )}
              </div>

              {showAdjust && (
                <div className="adjust-form-box">
                  <h4>Adjust Product Stock level</h4>
                  <form onSubmit={handleAdjustStock}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Adjustment Type</label>
                        <select value={adjustForm.movementType} onChange={(e) => setAdjustForm({ ...adjustForm, movementType: e.target.value as any })}>
                          <option value="IN">IN (Add Stock)</option>
                          <option value="OUT">OUT (Reduce Stock)</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Quantity</label>
                        <input type="number" min="1" required value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Reason *</label>
                      <input required placeholder="Reason for change..." value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
                    </div>
                    <div className="form-actions">
                      <button type="button" className="btn-secondary" onClick={() => setShowAdjust(false)}>Cancel</button>
                      <button type="submit" className="btn-primary">Submit Adjustment</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="detail-grid">
                <div><strong>Category:</strong> {selectedProduct.category}</div>
                <div><strong>Unit Price:</strong> ₹{selectedProduct.unitPrice.toFixed(2)}</div>
                <div><strong>Current Stock:</strong> {selectedProduct.currentStock}</div>
                <div><strong>Min Alert Threshold:</strong> {selectedProduct.minStockAlert}</div>
                <div><strong>Warehouse Location:</strong> {selectedProduct.warehouseLocation}</div>
              </div>

              <div className="movement-history">
                <h4>Stock Movement Log</h4>
                <div className="movement-list">
                  {movements.length === 0 ? <p className="no-data">No stock movements logged for this product.</p> : (
                    movements.map((m) => (
                      <div key={m.id} className={`movement-item ${m.movementType.toLowerCase()}`}>
                        <div className="m-type-badge">{m.movementType}</div>
                        <div className="m-details">
                          <strong>Qty: {m.quantityChanged}</strong> — {m.reason}
                          <div className="m-meta">By {m.createdBy?.name || 'Unknown'} on {new Date(m.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Select a product to view stock movement history logs.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChallansPage({ user }: { user: User | null }) {
  const [challans, setChallans] = useState<Challan[]>([]);
  const [selected, setSelected] = useState<Challan | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Creation states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [items, setItems] = useState<{ productId: number; quantity: number }[]>([]);

  const isSales = user?.role === 'SALES';

  const loadChallans = async () => {
    try {
      const q = [];
      if (search) q.push(`search=${encodeURIComponent(search)}`);
      if (statusFilter) q.push(`status=${statusFilter}`);
      const res = await axios.get(`${API_URL}/challans?${q.join('&')}`);
      setChallans(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadChallans();
  }, [search, statusFilter]);

  const selectChallan = async (c: Challan) => {
    try {
      const res = await axios.get(`${API_URL}/challans/${c.id}`);
      setSelected(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCreate = async () => {
    try {
      const [cRes, pRes] = await Promise.all([
        axios.get(`${API_URL}/customers?limit=100`),
        axios.get(`${API_URL}/products?limit=100`),
      ]);
      setCustomers(cRes.data.data || []);
      setProducts(pRes.data.data || []);
      setShowCreate(true);
      setItems([{ productId: pRes.data.data[0]?.id || 0, quantity: 1 }]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddItem = () => {
    if (products.length > 0) {
      setItems([...items, { productId: products[0].id, quantity: 1 }]);
    }
  };

  const handleRemoveItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: 'productId' | 'quantity', val: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: val };
    setItems(updated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      alert('Please select a customer');
      return;
    }
    if (items.length === 0) {
      alert('Challan must contain at least one item');
      return;
    }
    try {
      await axios.post(`${API_URL}/challans`, {
        customerId: Number(selectedCustomerId),
        items,
      });
      setShowCreate(false);
      setSelectedCustomerId('');
      setItems([]);
      loadChallans();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create challan');
    }
  };

  const handleConfirm = async (c: Challan) => {
    try {
      const res = await axios.put(`${API_URL}/challans/${c.id}/confirm`);
      setSelected(res.data);
      loadChallans();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to confirm challan');
    }
  };

  const handleCancel = async (c: Challan) => {
    if (!confirm('Are you sure you want to cancel this challan? This will restock all items.')) return;
    try {
      const res = await axios.put(`${API_URL}/challans/${c.id}/cancel`);
      setSelected(res.data);
      loadChallans();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to cancel challan');
    }
  };

  return (
    <div className="crud-container">
      <div className="crud-header">
        <h2>Delivery Challans</h2>
        {isSales && (
          <button className="btn-primary" onClick={handleOpenCreate}>+ Create Challan</button>
        )}
      </div>

      <div className="filter-bar">
        <input placeholder="Search challan number/customer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="split-view">
        <div className="list-panel">
          <table>
            <thead>
              <tr>
                <th>Challan #</th>
                <th>Customer</th>
                <th>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {challans.map((c) => (
                <tr key={c.id} onClick={() => selectChallan(c)} className={selected?.id === c.id ? 'active-row' : ''}>
                  <td>{c.challanNumber}</td>
                  <td>{c.customer?.name}</td>
                  <td>{c.totalQuantity}</td>
                  <td>
                    <span className={`status-tag ${c.status.toLowerCase()}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="detail-panel">
          {showCreate ? (
            <div className="card-form">
              <h3>Create Delivery Challan</h3>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label>Select Customer *</label>
                  <select required value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(Number(e.target.value))}>
                    <option value="">-- Choose Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.businessName || 'Retail'})</option>
                    ))}
                  </select>
                </div>

                <div className="challan-items-section">
                  <div className="items-header">
                    <h4>Challan Items</h4>
                    <button type="button" className="btn-add-item" onClick={handleAddItem}>+ Add Item</button>
                  </div>

                  {items.map((item, idx) => (
                    <div key={idx} className="item-row">
                      <div className="form-group flex-2">
                        <label>Product</label>
                        <select value={item.productId} onChange={(e) => handleItemChange(idx, 'productId', Number(e.target.value))}>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku}) — ₹{p.unitPrice}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group flex-1">
                        <label>Quantity</label>
                        <input type="number" min="1" required value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))} />
                      </div>
                      <button type="button" className="btn-remove-item" onClick={() => handleRemoveItem(idx)}>×</button>
                    </div>
                  ))}
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Save as Draft</button>
                </div>
              </form>
            </div>
          ) : selected ? (
            <div className="card-detail">
              <div className="detail-header-row">
                <div>
                  <h3>Challan: {selected.challanNumber}</h3>
                  <p className="detail-meta">Date: {new Date(selected.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className={`status-tag ${selected.status.toLowerCase()}`}>{selected.status}</span>
                </div>
              </div>

              <div className="detail-grid challan-cust">
                <div><strong>Customer:</strong> {selected.customer?.name}</div>
                <div><strong>Mobile:</strong> {selected.customer?.mobile}</div>
                <div><strong>Type:</strong> {selected.customer?.customerType}</div>
                <div><strong>Business Name:</strong> {selected.customer?.businessName || '-'}</div>
              </div>

              <div className="challan-items-list">
                <h4>Items Breakdown</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU (Snapshot)</th>
                      <th>Price (Snapshot)</th>
                      <th>Qty</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.productNameSnapshot}</td>
                        <td>{item.productSkuSnapshot}</td>
                        <td>₹{item.unitPriceSnapshot.toFixed(2)}</td>
                        <td>{item.quantity}</td>
                        <td>₹{(item.unitPriceSnapshot * item.quantity).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="challan-summary">
                  <div className="summary-row">
                    <span>Total Quantity:</span>
                    <strong>{selected.totalQuantity} items</strong>
                  </div>
                  <div className="summary-row">
                    <span>Grand Total:</span>
                    <strong className="grand-total-text">
                      ₹{selected.items.reduce((acc, item) => acc + (item.unitPriceSnapshot * item.quantity), 0).toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>

              {isSales && (
                <div className="challan-actions-row">
                  {selected.status === 'DRAFT' && (
                    <button className="btn-confirm" onClick={() => handleConfirm(selected)}>Confirm Challan & Deduct Stock</button>
                  )}
                  {selected.status === 'CONFIRMED' && (
                    <button className="btn-cancel" onClick={() => handleCancel(selected)}>Cancel Challan & Restock</button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">Select a delivery challan to view detailed item lists and confirm/cancel actions.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminPage() {
  return (
    <div className="admin-page">
      <h2>Admin Control Center</h2>
      <p>Secure system access parameters and seed status logs:</p>
      <div className="card-detail">
        <h4>Database Sequence Configs</h4>
        <p>PostgreSQL safe numbering sequence: <code>challan_number_seq</code> is initialized and operational.</p>
        <p>User tokens role authorizations: ADMIN, SALES, WAREHOUSE, ACCOUNTS.</p>
      </div>
    </div>
  );
}

export default App;
