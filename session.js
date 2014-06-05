
/**
 * dependencies
 */

var debug = require('debug')('koa-session-mongo:session');
var assert = require('assert');
var slice = require('sliced');
var eql = require('mongo-eql');
var uid = require('uid2');

/**
 * expose
 */

module.exports = exports = function(opts){
  var col = opts.collection;

  function Session() {
    debug('new Session');
    this.$cmd = {};
    this.id = uid(12);
    this.isNew = true;
    this.$saving = false;
  };

  /**
   * Retrieve a session document from MongoDB
   *
   * @param {String|Number} id
   * @return {Function} thunk
   */

  Session.get = function get (id) {
    debug('get id=%s', id);

    return function getSession (cb) {
      col.findOne({ _id: id }, function(err, obj) {
        if (err) return cb(err);
        var sess = new Session;
        sess.$init(id, obj);
        cb(null, sess);
      });
    }
  }

  /**
   * Remove a session document from MongoDB
   *
   * @param {String|Number} id
   * @return {Function} thunk
   */

  Session.remove = function remove (id) {
    if (!id) throw new Error('missing id');

    debug('remove id=%s', id);
    return function removeSession (cb) {
      col.remove({ _id: id }, cb);
    }
  }

  // prototype

  /**
   * Remove current keys. Become the session `obj`
   */

  Session.prototype.$become = function(obj) {
    var unset = {};
    var keys = Object.keys(this);
    var i = keys.length;
    var key;

    while (i--) {
      key = keys[i];
      if ('$' == key[0]) continue;
      if ('id' == key) continue;
      if ('isNew' == key) continue;
      unset[key] = 1;
    }

    // use the new values
    keys = Object.keys(obj);
    i = keys.length;

    while (i--) {
      key = keys[i];
      if ('$' == key[0]) continue;
      if ('id' == key) continue; // cannot change session id
      if ('_id' == key) continue;
      if ('isNew' == key) continue;
      else {
        delete unset[key];
        this.$set(key, obj[key]);
      }
    }

    keys = Object.keys(unset);
    i = keys.length;
    while (i--) {
      key = keys[i];
      this.$unset(key);
    }
  }

  /**
   * Create a session from an object in the db
   * Does not mark dirty
   */

  Session.prototype.$init = function(id, obj) {
    var keys = Object.keys(obj);
    var key;

    for (var i = 0; i < keys.length; ++i) {
      key = keys[i];
      if ('$' == key[0]) continue;
      if ('_id' == key) continue;
      if ('isNew' == key) continue;
      else this[key] = obj[key];
    }

    // can't change session id
    this.id = id;
    this.isNew = false;
  }

  Session.prototype.$set = function(path, val) {
    debug('$set', path, val);
    this.$cmd.$set || (this.$cmd.$set = {});
    this.$cmd.$set[path] = val;
    this[path] = val;
    return this.$thunk();
  }

  Session.prototype.$unset = function(path) {
    debug('$unset', path);
    this.$cmd.$unset || (this.$cmd.$unset = {});
    this.$cmd.$unset[path] = 1;
    delete this[path];
    return this.$thunk();
  }

  Session.prototype.$inc = function(path, val) {
    debug('$inc', path, val);
    this.$cmd.$inc || (this.$cmd.$inc = {});
    this.$cmd.$inc[path] = val;
    if (!this[path]) this[path] = 0;
    this[path] += val;
    return this.$thunk();
  }

  Session.prototype.$rename = function(oldPath, newPath) {
    debug('$rename', oldPath, newPath);
    this.$cmd.$rename || (this.$cmd.$rename = {});
    this.$cmd.$rename[oldPath] = newPath;
    this[newPath] = this[oldPath];
    delete this[oldPath];
    return this.$thunk();
  }

  Session.prototype.$push = function(path) {
    var vals = slice(arguments, 1);
    debug('$push', path, vals);
    return this.$pushAll(path, vals);
  }

  /**
   * @param {String} path
   * @param {Array} vals
   */

  Session.prototype.$pushAll = function(path, vals) {
    debug('$pushAll', path, vals);
    assert(Array.isArray(vals), 'vals must be an array');

    if (this[path] && !Array.isArray(this[path])) {
      throw new TypeError(path + ' must be an array');
    }

    this[path] || (this[path] = []);
    var arr = this[path];
    arr.push.apply(arr, vals);

    this.$cmd.$pushAll || (this.$cmd.$pushAll = {});
    this.$cmd.$pushAll[path] || (this.$cmd.$pushAll[path] = []);
    ary = this.$cmd.$pushAll[path];
    ary.push.apply(ary, vals);

    return this.$thunk();
  }

  // uses a query match
  Session.prototype.$pull = function(path) {
    var vals = slice(arguments, 1);
    debug('$pull', path, vals);
    // TODO
  }

  // actual matches required( order matters)
  Session.prototype.$pullAll = function(path, vals) {
    debug('$pullAll', path, vals);
    assert(Array.isArray(vals), 'vals must be an array');

    if (this[path] && !Array.isArray(this[path])) {
      throw new TypeError(path + ' must be an array');
    }

    // TODO handle objects and arrays deeply using eql()
    // see $addToSet
    // mongo pulls anything where all properties exact match (objects)
    // mongo pulls anything with exact match (array)
    //this[path] = (this[path] || []).filter(function(val) {
      //return !~vals.indexOf(val);
    //});

    var ary = this[path] || (this[path] = []);

    for (var i = 0; i < vals.length; ++i) {
      var val = vals[i];
      var j = ary.length;
      while (j--) {
        // if object properties match, remove
        // or array exact match, remove
        //if (eql(ary[j], val)) ary.splice(j, 1);
      }
    }

    this.$cmd.$pullAll || (this.$cmd.$pullAll = {});
    this.$cmd.$pullAll[path] || (this.$cmd.$pullAll[path] = []);
    var ary = this.$cmd.$pullAll[path];
    ary.push.apply(ary, vals);

    return this.$thunk();
  }

  Session.prototype.$pop = function(path) {
    debug('$pop', path);

    if (this[path] && !Array.isArray(this[path])) {
      throw new TypeError(path + ' must be an array');
    }

    this.$cmd.$pop || (this.$cmd.$pop = {});
    this.$cmd.$pop[path] = 1;

    // intentionally ignore pop return val so all ops can be yielded
    this[path].pop();
    return this.$thunk();
  }

  Session.prototype.$shift = function(path) {
    debug('$shift', path);
    this.$cmd.$pop || (this.$cmd.$pop = {});
    this.$cmd.$pop[path] = -1;
    this[path].shift();
    return this.$thunk();
  }

  Session.prototype.$addToSet = function(path, vals) {
    debug('$addToSet', path, vals);

    assert(Array.isArray(vals), 'vals must be an array');

    if (this[path] && !Array.isArray(this[path])) {
      throw new TypeError(path + ' must be an array');
    }

    this.$cmd.$addToSet || (this.$cmd.$addToSet = {});
    this.$cmd.$addToSet[path] || (this.$cmd.$addToSet[path] = { $each: [] });
    var ary = this.$cmd.$addToSet[path].$each;
    ary.push.apply(ary, vals);

    // add unique vals to our local array
    this[path] || (this[path] = []);
    ary = this[path];

    for (var i = 0; i < vals.length; ++i) {
      var val = vals[i];
      var found = false;

      // if any incoming val equals val, skip it. else add it
      for (var j = 0; j < ary.length; ++j) {
        if (eql(ary[j], val)) {
          found = true;
          break;
        }
      }

      if (!found) ary.push(val);
    }

    return this.$thunk();
  }

  /**
   * Reloads this session
   *
   *   yield session.reload()
   *
   * @returns {thunk}
   */

  Session.prototype.$reload = function() {
    debug('$reload');

    var session = this;
    return function(cb) {
      col.findOne({ _id: session.id }, function(err, obj) {
        if (err) return cb(err);
        if (null == obj) return cb(new Error('could not find session'));
        session.$become(obj);
        cb();
      });
    }
  }

  Session.prototype.toJSON = function() {
    var keys = Object.keys(this);
    var i = keys.length;
    var ret = {};
    var key;

    while (i--) {
      key = keys[i];
      if ('$' == key[0]) continue;
      ret[key] = this[key];
    }

    return ret;
  }

  Session.prototype.$isDirty = function() {
    debug('$isDirty');
    return Object.keys(this.$cmd).length > 0;
  }

  /**
   * Creates a `thunk` which saves this session
   *
   *   yield session.$thunk()
   *
   * @returns {thunk}
   */

  Session.prototype.$thunk = function() {
    debug('$thunk');

    var session = this;
    return session.$_thunk || (session.$_thunk = function updateSession(cb) {
      assert('function' == typeof cb, 'cb must be a function');
      debug('saving', session.id);

      if (session.$saving)
        return cb(new Error('The session is already being saved'));

      session.$saving = true;
      session.isNew = false;

      var update = session.$cmd;
      var query = { _id: session.id };
      var opts = { upsert: true };

      debug('saving %j', update);

      col.update(query, update, opts, function(err) {
        session.$saving = false;
        if (err) return cb(err);
        session.$cmd = {};
        cb(null, this);
      });
    });
  }

  return Session;
}

