
const API = 'http://localhost:4000/api';
let currentUser = null;
axios.defaults.withCredentials = true;

document.getElementById('btnRegister').onclick = async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (!email || !password) return alert('enter email and password');
  const r = await axios.post(`${API}/register`, { email, password });
  currentUser = r.data;
  document.getElementById('userInfo').textContent = `id: ${currentUser.id} email: ${currentUser.email}`;
  await refreshUser();
  await loadTasks();
};

document.getElementById('btnLogin').onclick = async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  if (!email || !password) return alert('enter email and password');
  const r = await axios.post(`${API}/login`, { email, password });
  currentUser = r.data;
  document.getElementById('userInfo').textContent = `id: ${currentUser.id} email: ${currentUser.email}`;
  await refreshUser();
  await loadTasks();
};

document.getElementById('btnLogout').onclick = async () => {
  await axios.post(`${API}/logout`);
  currentUser = null;
  document.getElementById('userInfo').textContent = '';
  document.getElementById('balanceVal').textContent = '-';
};

document.getElementById('btnRequestVerify').onclick = async () => {
  if (!currentUser) return alert('login first');
  await axios.post(`${API}/request-verification`);
  alert('Verification email requested (check console if SMTP not configured)');
};

document.getElementById('btnRequestReset').onclick = async () => {
  const email = document.getElementById('resetEmail').value;
  if (!email) return alert('enter email');
  await axios.post(`${API}/request-reset`, { email });
  alert('If an account exists, a reset email was sent (check console if SMTP not configured)');
};

document.getElementById('btnSubmitReset').onclick = async () => {
  const token = document.getElementById('resetToken').value;
  const password = document.getElementById('resetNewPassword').value;
  if (!token || !password) return alert('token and new password required');
  await axios.post(`${API}/reset-password`, { token, password });
  alert('Password reset — you should be logged in now');
};

async function refreshUser(){
  if (!currentUser) return;
  const r = await axios.get(`${API}/user/${currentUser.id}`);
  document.getElementById('balanceVal').textContent = `$${(r.data.balance/100).toFixed(2)}`;
}

async function loadTasks(){
  const r = await axios.get(`${API}/tasks`);
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  r.data.forEach(t => {
    const li = document.createElement('li');
    li.textContent = `${t.title} — ${t.points} cents`;
    const btn = document.createElement('button');
    btn.textContent = 'Complete';
    btn.onclick = async () => {
      if (!currentUser) return alert('login or register first');
      await axios.post(`${API}/complete`, { taskId: t.id });
      await refreshUser();
    };
    li.appendChild(btn);
    list.appendChild(li);
  });
}

document.getElementById('btnDeposit').onclick = async () => {
  if (!currentUser) return alert('login or register');
  const usd = parseFloat(document.getElementById('amount').value);
  if (!usd || usd <= 0) return alert('enter amount');
  const cents = Math.round(usd * 100);
  const r = await axios.post(`${API}/deposit`, { amount: cents });
  alert('Created Stripe session (test). In production redirect to checkout URL: ' + r.data.checkoutUrl);
};

// initial tasks load (if server has defaults)
loadTasks();

// Handle incoming verification/reset links when served by static host
(async function handleLinks(){
  try{
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;
    if (window.location.pathname.includes('verify')){
      const r = await axios.get(`${API}/verify`, { params: { token } });
      alert(r.data || 'Email verified');
      window.history.replaceState({}, document.title, '/');
    }
    if (window.location.pathname.includes('reset')){
      document.getElementById('resetToken').value = token;
      alert('Reset token prefilled. Enter new password and submit.');
      window.history.replaceState({}, document.title, '/');
    }
  }catch(e){
    console.error(e);
  }
})();
