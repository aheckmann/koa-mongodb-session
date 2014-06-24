
/**
 * dependencies
 */

var debug = require('debug')('koa-mongodb-session:session');
var assert = require('assert');
var slice = require('sliced');
var eql = require('mongo-eql');
var uid = require('uid2');
var update = require('mongo-query');

/**
 * expose
 */

module.exports = exports = function(opts){
  var col = opts.collection;

  function Session() {
    debug('new Session');
    this.id = uid(12);
    this.isNew = true;
    this.$cmd = {};
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

  Session.prototype.$set = function(path, val) {
    debug('$set', path, val);

    var op = {};
    op[path] = val;
    update(this, null, { $set: op });

    this.$cmd.$set || (this.$cmd.$set = {});
    this.$cmd.$set[path] = val;

    return this.$thunk();
  }

  Session.prototype.$unset = function(path) {
    debug('$unset', path);

    var op = {};
    op[path] = 1;
    update(this, null, { $unset: op });

    this.$cmd.$unset || (this.$cmd.$unset = {});
    this.$cmd.$unset[path] = 1;

    return this.$thunk();
  }

  Session.prototype.$inc = function(path, val) {
    debug('$inc', path, val);

    var op = {};
    op[path] = val;
    update(this, null, { $inc: op });

    this.$cmd.$inc || (this.$cmd.$inc = {});
    this.$cmd.$inc[path] = val;

    return this.$thunk();
  }

  Session.prototype.$rename = function(oldPath, newPath) {
    debug('$rename', oldPath, newPath);

    var op = {};
    op[oldPath] = newPath;
    update(this, null, { $rename: op });

    this.$cmd.$rename || (this.$cmd.$rename = {});
    this.$cmd.$rename[oldPath] = newPath;

    return this.$thunk();
  }

  Session.prototype.$push = function(path, val) {
    debug('$push', path, val);

    var op = {};
    op[path] = val;
    update(this, null, { $push: op });

    this.$cmd.$push || (this.$cmd.$push = {});
    this.$cmd.$push[path] = val;

    // $each, $position, $slice, $sort ?

    return this.$thunk();
  }

  Session.prototype.$pushAll = function(path, vals) {
    debug('$pushAll', path, vals);
    assert(Array.isArray(vals), 'vals must be an array');

    if (this[path] && !Array.isArray(this[path])) {
      throw new TypeError(path + ' must be an array');
    }

    var op = {};
    op[path] = vals;
    update(this, null, { $pushAll: op });

    this.$cmd.$pushAll || (this.$cmd.$pushAll = {});
    this.$cmd.$pushAll[path] || (this.$cmd.$pushAll[path] = []);
    ary = this.$cmd.$pushAll[path];
    ary.push.apply(ary, vals);

    return this.$thunk();
  }

  Session.prototype.$pull = function(path, val) {
    debug('$pull', path, val);

    var op = {};
    op[path] = val;
    update(this, null, { $pull: op })

    this.$cmd.$pull || (this.$cmd.$pull = {});
    this.$cmd.$pull[path] || (this.$cmd.$pull[path] = val);

     return this.$thunk();
  }

  Session.prototype.$pullAll = function(path, vals) {
    debug('$pullAll', path, vals);
    assert(Array.isArray(vals), 'vals must be an array');

    var op = {};
    op[path] = vals;
    update(this, null, { $pullAll: op })

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

    var op = {};
    op[path] = 1;
    update(this, null, { $pop: op });

    this.$cmd.$pop || (this.$cmd.$pop = {});
    this.$cmd.$pop[path] = 1;

    return this.$thunk();
  }

  Session.prototype.$shift = function(path) {
    debug('$shift', path);

    if (this[path] && !Array.isArray(this[path])) {
      throw new TypeError(path + ' must be an array');
    }

    var op = {};
    op[path] = -1;
    update(this, null, { $pop: op });

    this.$cmd.$pop || (this.$cmd.$pop = {});
    this.$cmd.$pop[path] = -1;

    return this.$thunk();
  }

  Session.prototype.$addToSet = function(path, vals) {
    debug('$addToSet', path, vals);

    assert(Array.isArray(vals), 'vals must be an array');

    if (this[path] && !Array.isArray(this[path])) {
      throw new TypeError(path + ' must be an array');
    }

    // TODO use mongo-query once addToSet works better

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
   * Reloads this session from the db
   *
   *   yield session.$reload()
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
        session.$become(obj, true);
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

  /**
   * @api private
   */

  Session.prototype.$isDirty = function() {
    debug('$isDirty');
    return Object.keys(this.$cmd).length > 0;
  }

  /**
   * Remove current keys. Become the session `obj`
   * @api private
   */

  Session.prototype.$become = function(obj, memoryOnly) {
    var op = {};
    var unset = op.$unset = {};
    var set = op.$set = {};

    // remove current vals
    var keys = Object.keys(this);
    var i = keys.length;
    var key;

    while (i--) {
      key = keys[i];
      if ('$' == key[0]) continue;
      if ('id' == key) continue;
      if ('_id' == key) continue;
      if ('isNew' == key) continue;
      unset[key] = 1;
    }

    // apply the new values
    keys = Object.keys(obj);
    i = keys.length;

    while (i--) {
      key = keys[i];
      if ('$' == key[0]) continue;
      if ('id' == key) continue; // cannot change session id
      if ('_id' == key) continue;
      if ('isNew' == key) continue;
      delete unset[key];
      set[key] = obj[key];
    }

    if (memoryOnly) {
      update(this, null, { $unset: op.$unset });
      update(this, null, { $set: op.$set });
      return;
    }

    keys = Object.keys(unset);
    i = keys.length;
    while (i--) this.$unset(keys[i], unset[keys[i]]);

    keys = Object.keys(set);
    i = keys.length;
    while (i--) this.$set(keys[i], set[keys[i]]);
  }

  /**
   * Create a session from an object in the db
   * Does not mark dirty
   * @api private
   */

  Session.prototype.$init = function(id, obj) {
    if (obj) {
      var keys = Object.keys(obj);
      var key;

      for (var i = 0; i < keys.length; ++i) {
        key = keys[i];
        if ('$' == key[0]) continue;
        if ('_id' == key) continue;
        if ('isNew' == key) continue;
        else this[key] = obj[key];
      }
    }

    // can't change session id
    this.id = id;
    this.isNew = false;
  }

  /**
   * Creates a `thunk` which saves this session
   *
   *   yield session.$thunk()
   *
   * @returns {thunk}
   * @api private
   */

  Session.prototype.$thunk = function() {
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

