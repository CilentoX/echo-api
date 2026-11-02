import('matrix-js-sdk').then(mod => {
  const c = mod.createClient({baseUrl:'http://echo-postgres:8008', accessToken:'test', userId:'@test:example'});
  console.log('baseUrl:', c.baseUrl);
  console.log('userId:', c.userId);
  console.log('clientOpts:', c.clientOpts);
  console.log('deviceId:', c.deviceId);
  console.log('sessionId:', c.sessionId);
}).catch(err => console.error(err));