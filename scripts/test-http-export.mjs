import http from 'http';

async function testHttp() {
  const url = 'http://localhost:3000/api/export/render?clipId=ranked-clip-test-1&download=true&format=9:16&startTime=1&endTime=4';
  
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      console.log('HTTP Status:', res.statusCode);
      console.log('Content-Type:', res.headers['content-type']);
      console.log('Content-Disposition:', res.headers['content-disposition']);
      console.log('Content-Length:', res.headers['content-length']);

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const total = Buffer.concat(chunks);
        console.log(`Received ${total.length} bytes over HTTP`);
        if (res.statusCode === 200 && total.length > 50000) {
          console.log('HTTP GET /api/export/render verification PASSED!');
          resolve();
        } else {
          reject(new Error(`Bad response: status ${res.statusCode}, length ${total.length}`));
        }
      });
    }).on('error', reject);
  });
}

testHttp().catch(err => {
  console.error('HTTP export test error:', err.message);
  process.exit(1);
});
