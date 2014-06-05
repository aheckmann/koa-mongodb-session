var session = require('../');
var mongodb = require('mongodb');
var mongo = mongodb.MongoClient;
var koa = require('koa');

mongo.connect('mongodb://localhost/test', function(err, db){
  if (err) throw err;

  var app = koa();
  app.keys = ['some secret'];
  app.use(session( { collection: db.collection('session') }));

  app.use(function *(){
    this.session.$inc('views', 1);
    this.body = this.session.views + ' views';
  })

  app.listen(3000);
  console.log('listening on http://localhost:3000');
})

