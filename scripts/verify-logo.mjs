async function verify() {
  try {
    const res = await fetch('https://flowzoraclips.vercel.app');
    const html = await res.text();
    console.log('Status:', res.status);
    console.log('Has flowzoraclips brand text:', html.includes('flowzora') && html.includes('clips'));
    console.log('No orange F logo:', !html.includes('bg-[#FF5722] text-white font-bold text-sm shadow-sm transition-transform group-hover:scale-105'));
  } catch (err) {
    console.error(err);
  }
}

verify();
