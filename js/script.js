document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('theme-toggle');
  const root=document.documentElement;
  const saved=localStorage.getItem('theme');
  if(saved==='dark') document.documentElement.setAttribute('data-theme','dark');
  function updateIcon(){
    btn.textContent = document.documentElement.getAttribute('data-theme')==='dark' ? '☀️' : '🌙';
  }
  updateIcon();
  btn.addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme');
    const next = cur==='dark' ? '' : 'dark';
    if(next) document.documentElement.setAttribute('data-theme',next);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', next || 'light');
    updateIcon();
  });

  // Contact form: open mailto as lightweight fallback
  const form=document.getElementById('contact-form');
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const data=new FormData(form);
    const email=encodeURIComponent(data.get('email'));
    const body=encodeURIComponent(data.get('message'));
    const subject=encodeURIComponent('Portfolio contact from '+email);
    window.location.href = `mailto:your@email.com?subject=${subject}&body=${body}`;
  });

  // set year in footer
  const year=document.getElementById('year'); if(year) year.textContent=new Date().getFullYear();
});
