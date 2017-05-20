const express = require('express');
const bodyParser = require('body-parser');

const app = express();

app.use(express.static('.'));
//app.use(bodyParser);

app.get('/slow', (req, res) => {
  console.log('GET /slow');
  setTimeout(() => res.send(200), 10000);
});

app.post('/blob', (req, res) => {
  console.log('POST /blob');
  console.log('req', req);

  res.send(200);
});

app.listen(8000, () => {
  console.log('Listening on port 8000');
});
