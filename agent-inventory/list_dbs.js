const xmlrpc = require('xmlrpc');

const url = 'http://localhost:8069';

const commonClient = xmlrpc.createClient({ host: 'localhost', port: 8069, path: '/xmlrpc/2/common' });
const dbClient = xmlrpc.createClient({ host: 'localhost', port: 8069, path: '/xmlrpc/2/db' });

console.log('Trying /xmlrpc/2/db list...');
dbClient.methodCall('list', [], (error, value) => {
  if (error) {
    console.error('Error listing databases from /db:', error.message);
  } else {
    console.log('Available databases from /db:', value);
  }

  console.log('Trying /xmlrpc/2/common list...');
  commonClient.methodCall('list', [], (error, value) => {
    if (error) {
      console.error('Error listing databases from /common:', error.message);
    } else {
      console.log('Available databases from /common:', value);
    }
  });
});
