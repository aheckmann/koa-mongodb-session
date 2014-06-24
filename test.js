var koa = require('koa');
var request = require('supertest');
var koaSession = require('./');
var mongo = require('mongodb').MongoClient;
var assert = require('assert');

var uri = process.env.KOA_SESSION_MONGO_TEST_URI || 'mongodb://localhost/koa-mongodb-session';

describe('Koa Session Mongo', function(){
  var cookie;
  var col;
  var db;

  function merge (a, b) {
    for (var key in b)
      a[key] = b[key];
  }

  function session (opts) {
    if (!opts) opts = {};
    merge(opts, { collection: col });
    return koaSession(opts);
  };

  before(function(done) {
    mongo.connect(uri, function(err, db_) {
      if (err) return done(err);
      db = db_;
      col = db.collection('session');
      done();
    });
  });

  after(function(done) {
    // ignore errors, they don't mean our tests failed
    db.dropDatabase(function(err) {
      db.close(function(err) {
        done();
      });
    })
  });

  function App(options) {
    var app = koa();
    app.keys = ['a', 'b'];
    app.use(session(options));
    return app;
  }

  describe('when no collection is passed', function() {
    it('throws', function(done) {
      assert.throws(function() {
        koaSession({});
      }, /missing mongodb collection/);
      done();
    });
  });

  describe('when collection is passed', function() {
    it('does not throw', function(done) {
      assert.doesNotThrow(function() {
        koaSession({ collection: col });
      });
      done();
    });
  });

  describe('when options.signed = true', function(){
    describe('when app.keys are set', function(){
      it('should work', function(done){
        var app = koa();

        app.keys = ['a', 'b'];
        app.use(session());

        app.use(function *(){
          this.session.$set('message', 'hi');
          this.body = this.session;
        });

        request(app.listen())
        .get('/')
        .expect(200, done);
      })
    })

    describe('when app.keys are not set', function(){
      it('should throw', function(done){
        var app = koa();

        app.use(session());

        app.use(function *(){
          this.session.$set('message', 'hi');
          this.body = this.session;
        });

        request(app.listen())
        .get('/')
        .expect(500, done);
      })
    })
  })

  describe('when options.signed = false', function(){
    describe('when app.keys are not set', function(){
      it('should work', function(done){
        var app = koa();

        app.use(session({ signed: false }));

        app.use(function *(){
          this.session.$set('message', 'hi');
          this.body = this.session;
        });

        request(app.listen())
        .get('/')
        .expect(200, done);
      })
    })
  })

  describe('when the session contains a ;', function(){
    it('should still work', function(done){
      var app = App();

      app.use(function *(){
        if (this.method === 'POST') {
          this.session.$set('string', ';');
          this.status = 204;
        } else {
          this.body = this.session.string;
        }
      });

      var server = app.listen();

      request(server)
      .post('/')
      .expect(204, function(err, res){
        if (err) return done(err);
        var cookie = res.headers['set-cookie'];
        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect(';', done);
      })
    })
  })

  describe('new session', function(){
    describe('when not accessed', function(){
      it('should not Set-Cookie', function(done) {
        var app = App();

        app.use(function *(){
          this.body = 'greetings';
        })

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when accessed and not populated', function(done){
      it('should not Set-Cookie', function(done) {
        var app = App();

        app.use(function *(){
          this.session;
          this.body = 'greetings';
        });

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when populated', function(done){
      it('should Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session.$set('message', 'hello');
          this.body = '';
        })

        request(app.listen())
        .get('/')
        .expect('Set-Cookie', /.*/)
        .expect(200, function(err, res){
          if (err) return done(err);
          cookie = res.header['set-cookie'].join(';');
          done();
        })
      })

      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.body = this.session;
        })

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })
  })

  describe('saved session', function(){
    describe('when not accessed', function(){
      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when accessed but not changed', function(){
      it('should be the same session', function(done){
        var app = App();

        app.use(function *(){
          this.session.message.should.equal('hello');
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect(200, done);
      })

      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session.message.should.equal('hello');
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        })
      })
    })

    describe('when accessed and changed', function(){
      it('should Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session.$set('money', '$$$');
          this.body = 'aklsdjflasdjf';
        })

        request(app.listen())
        .get('/')
        .set('Cookie', cookie)
        .expect('Set-Cookie', /sid=[^;]+/)
        .expect(200, done);
      })
    })
  })

  describe('when session is', function(){
    describe('null', function(){
      it('should expire the session', function(done){
        var app = App();

        app.use(function *(){
          this.session = null;
          this.body = 'asdf';
        })

        request(app.listen())
        .get('/')
        .expect('Set-Cookie', /sid=;/)
        .expect(200, done);
      })
    })

    describe('an empty object', function(){
      it('should not Set-Cookie', function(done){
        var app = App();

        app.use(function *(){
          this.session = {};
          this.body = 'asdf';
        })

        request(app.listen())
        .get('/')
        .expect(200, function(err, res){
          if (err) return done(err);
          res.header.should.not.have.property('set-cookie');
          done();
        });
      })
    })

    describe('an object', function(){
      it('should create a session', function(done){
        var app = App();

        app.use(function *(){
          this.session.huh = false;
          this.session = { message: 'hello', age: 108 };
          assert.equal('hello', this.session.message);
          assert.equal(108, this.session.age);
          this.body = 'asdf';
        })

        request(app.listen())
        .get('/')
        .expect('Set-Cookie', /sid=[^;]+/)
        .expect(200, done);
      })
    })

    describe('anything else', function(){
      it('should throw', function(done){
        var app = App();

        app.use(function *(){
          this.session = 'asdf'
        })

        request(app.listen())
        .get('/')
        .expect(500, done);
      })
    })
  })

  describe('when an error is thrown downstream and caught upstream', function(){
    it('should still save the session', function(done){
      var app = koa();

      app.keys = ['a', 'b'];

      app.use(function *(next){
        try {
          yield *next;
        } catch (err) {
          this.status = err.status;
          this.body = err.message;
        }
      });

      app.use(session());

      app.use(function *(next){
        this.session.$set('name', 'funny');
        yield *next;
      });

      app.use(function *(next){
        this.throw(401);
      });

      request(app.listen())
      .get('/')
      .expect('Set-Cookie', /sid=[^;]+/)
      .expect(401, done);
    })
  })

  describe('$set', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        assert.equal(undefined, this.session.name);
        this.session.$set('name', 'koa');
        this.body = this.session.name;
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('koa', done);
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        assert.equal(undefined, this.session.name);
        yield this.session.$set('name', 'koa');
        yield this.session.$reload();
        this.body = this.session.name;
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('koa', done);
    });
  });

  describe('$unset', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        assert.equal(undefined, this.session.name);
        yield this.session.$set('name.last', 'koa');
        this.session.$unset('name.last');
        this.body = this.session.name.last || 'nope'
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('nope', done);
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        assert.equal(undefined, this.session.name);
        yield this.session.$set('name.last', 'koa');
        yield this.session.$unset('name.last');
        yield this.session.$reload();
        this.body = this.session.name.last || 'nope'
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('nope', done);
    });
  });

  describe('$inc', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        this.session.$inc('views', 1);
        this.body = this.session.views;
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('1', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('2', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$inc('views', 10);
        yield this.session.$reload();
        this.body = this.session.views;
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('10', done);
    });
  });

  describe('$rename', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          yield this.session.$inc('vews', 1);
          this.session.$rename('vews', 'views');
          this.body = this.session.views;
        } else {
          this.body = this.session.views + 1;
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('1', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('2', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          this.session.$set('x', 1);
          this.body = this.session.x;
        } else {
          yield this.session.$rename('x', 'y');
          this.body = this.session.y;
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('1', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('1', done);
      });
    });
  });

  describe('$push', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          assert.equal(undefined, this.session.array);
          this.session.$push('array', 2);
          this.body = this.session.array[0];
        } else {
          this.body = this.session.array[0] + 'x2';
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('2', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('2x2', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$push('array', 2);
        yield this.session.$reload();
        this.body = this.session.array[0];
      })

      var server = app.listen();
      request(server)
      .get('/')
      .expect('2', done);
    });
  });

  describe('$pushAll', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          assert.equal(undefined, this.session.array);
          this.session.$pushAll('array', [2,4]);
          this.body = this.session.array;
        } else {
          this.body = this.session.array[1];
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('[2,4]', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('4', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$pushAll('array', [2,4]);
        yield this.session.$reload();
        this.body = this.session.array[1];
      })

      var server = app.listen();
      request(server)
      .get('/')
      .expect('4', done);
    });
  });

  describe('$pull', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          yield this.session.$pushAll('array', [1,2,3,3]);
          this.session.$pull('array', 3);
          this.body = this.session.array.length;
        } else {
          this.body = this.session.array.indexOf(3);
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('2', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('-1', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$pushAll('array', [1,2,3,4,2]);
        yield this.session.$pull('array', 2);
        yield this.session.$reload();
        this.body = this.session.array.indexOf(2);
      })

      var server = app.listen();
      request(server)
      .get('/')
      .expect('-1', done);
    });
  });

  describe('$pullAll', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          yield this.session.$pushAll('array', [2,4,['hi'],6,4,{y:{z:true}},2]);
          this.session.$pullAll('array', [2,4, ['hi'], { y: { z: true }}]);
          this.body = this.session.array.length;
        } else {
          this.body = this.session.array;
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('1', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('[6]', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$pushAll('array', [2,4,2,2,1,4]);
        yield this.session.$pullAll('array', [4,2]);
        yield this.session.$reload();
        this.body = this.session.array[0];
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('1', done);
    });
  });

  describe('$pop', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          yield this.session.$pushAll('array', [1,2,3,4]);
          this.session.$pop('array');
          this.body = this.session.array[this.session.array.length-1];
        } else {
          this.body = this.session.array[this.session.array.length-1];
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('3', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('3', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$pushAll('array', [2,4,2,2,1,4]);
        yield this.session.$pop('array');
        yield this.session.$reload();
        this.body = this.session.array[this.session.array.length-1];
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('1', done);
    });
  });

  describe('$shift', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          yield this.session.$pushAll('thing.array', [1,2,3,4]);
          this.session.$shift('thing.array');
          this.body = this.session.thing.array[0];
        } else {
          this.body = this.session.thing.array[0];
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('2', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('2', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$pushAll('array', [1,2,3,4,5]);
        yield this.session.$shift('array');
        yield this.session.$reload();
        this.body = this.session.array[0];
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('2', done);
    });
  });

  describe('$addToSet', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        if ('POST' == this.method) {
          assert.equal(undefined, this.session.array);
          this.session.$addToSet('array', [2,4,2,6]);
          this.body = this.session.array;
        } else {
          this.body = this.session.array;
        }
      })

      var server = app.listen();

      request(server)
      .post('/')
      .expect('[2,4,6]', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        request(server)
        .get('/')
        .set('Cookie', cookie.join(';'))
        .expect('[2,4,6]', done);
      });
    });

    it('can be yielded', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$addToSet('array', [2,2,4,4]);
        yield this.session.$reload();
        this.body = this.session.array;
      })

      var server = app.listen();
      request(server)
      .get('/')
      .expect('[2,4]', done);
    });

    describe('with nested', function() {
      describe('arrays', function() {
        it('works', function(done) {
          var app = App();

          app.use(function *(){
            this.session.$addToSet('array', [1, [1,[2],3]]);
            yield this.session.$addToSet('array', [[1,[2],3], [1,[2],3], 4]);
            yield this.session.$reload();
            this.body = this.session.array;
          })

          var server = app.listen();
          request(server)
          .get('/')
          .expect('[1,[1,[2],3],4]', done);
        });
      });

      describe('objects', function() {
        it('works', function(done) {
          var app = App();

          app.use(function *(){
            this.session.$addToSet('array', [
                { x: { y: [3,4] }}
              , { x: { y: [4,3] }}
              , { y: true, x: { y: [4,3] }}
            ]);

            yield this.session.$addToSet('array', [
                { x: { y: [4,3] }}
              , { y: true, x: { y: [4,3] }}
              , ['koa']
              , { y: true, x: { y: [4,3] }}
              , { x: { y: [4,3] }}
            ]);

            yield this.session.$reload();
            this.body = this.session.array;
          })

          var server = app.listen();
          request(server)
          .get('/')
          .expect('[{"x":{"y":[3,4]}},{"x":{"y":[4,3]}},{"y":true,"x":{"y":[4,3]}},["koa"]]', done);
        });
      });
    });
  });

  describe('$reload', function() {
    it('works', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$pushAll('array', [2,4,2,2,1,4]);
        yield this.session.$reload();
        this.body = {
          array: this.session.array
        }
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect('{"array":[2,4,2,2,1,4]}', done);
    });

    it('fails when no session exists in the db', function(done) {
      var app = App();

      app.use(function *(){
        yield this.session.$reload();
        this.body = 'pebble';
      })

      var server = app.listen();

      request(server)
      .get('/')
      .expect(500, done);
    });
  });

  describe('when cookie with sid exists but no document is found', function() {
    it('works (gh-6)', function(done) {
      var app = App();
      var id;

      app.use(function *(){
        if ('/setup' == this.url) {
          this.session.$set('name', '#gh-6');
          this.body = 'setup';
          id = this.session.id;
        } else {
          this.body = 'works';
        }
      })

      var server = app.listen();

      request(server)
      .get('/setup')
      .expect('setup', function(err, res) {
        if (err) return done(err);

        var cookie = res.headers['set-cookie'];

        col.remove({ _id: id }, function(err) {
          if (err) return done(err);

          request(server)
          .get('/')
          .set('Cookie', cookie.join(';'))
          .expect('works', done);
        });
      });
    });
  });
})

