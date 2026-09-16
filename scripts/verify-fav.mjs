async function verify() {
  try {
    const resSvg = await fetch('https://flowzoraclips.vercel.app/favicon.svg');
    const svgText = await resSvg.text();
    console.log('favicon.svg status:', resSvg.status, 'has chevrons:', svgText.includes('stroke="#FFFFFF"'));

    const resIco = await fetch('https://flowzoraclips.vercel.app/favicon.ico');
    console.log('favicon.ico status:', resIco.status, 'length:', resIco.headers.get('content-length'));
  } catch (err) {
    console.error(err);
  }
}

verify();
