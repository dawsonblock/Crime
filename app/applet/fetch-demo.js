const http = require('https');

http.get('https://map.saskatoonpolice.ca/', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(body));
});
