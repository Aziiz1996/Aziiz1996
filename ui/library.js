try{if(location.pathname==='/login')history.replaceState(null,'','/')}catch{}
try{const n=Number(localStorage.getItem('aziz-reader-page'));if(n>1&&n<=101){const a=document.getElementById('resume');a.hidden=false;a.href='/read?page='+n;a.textContent='تابع من الصفحة '+n}}catch{}
