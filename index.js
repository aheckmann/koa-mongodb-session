
/**
 * Module dependencies.
 */

var debug = require('debug')('koa-mongodb-session:middleware');
var mongoSession = require('./session');

/**
 * Initialize session middleware with `opts`:
 *
 * - `key` session cookie name ["sid"]
 * - `collection` mongodb collection object: db.collection(name)
 * - all other options are passed as cookie options
 *
 * @param {Object} [opts]
 * @api public
 */

module.exports = function(opts){
  if (!opts)
    throw new Error('missing options');

  // this app could be receiving requests before mongodb is connected
  // so just delegate creation of connection to userland
  if (null == opts.collection)
    throw new Error('missing mongodb collection');

  var Session = mongoSession(opts);
  opts.key || (opts.key = 'sid');

  // defaults
  if (null == opts.overwrite) opts.overwrite = true;
  if (null == opts.httpOnly) opts.httpOnly = true;
  if (null == opts.signed) opts.signed = true;

  // friendly debugging of opts
  opts.collection = opts.collection.collectionName;
  debug('options %j', opts);

  return function *(next){
    this.sessionOptions = opts;
    this.sessionKey = opts.key;

    var sess;
    var sid = this.cookies.get(opts.key, opts);

    if (sid) sess = yield Session.get(sid);

    this.__defineGetter__('session', function(){
      if (sess) return sess;

      // unset
      if (false === sess) return null;

      sess = new Session;
      sid = String(sess.id);
      return sess;
    });

    this.__defineSetter__('session', function(val){
      if (null == val) return sess = false;

      if ('object' == typeof val) {
        sess || (sess = new Session);
        sess.$become(val);
        sid || (sid = sess.id);
        return sess;
      }

      throw new Error('this.session can only be set as null or an object.');
    });

    try {
      yield *next;
    } finally {
      yield *commit(this, sess, sid, opts, Session);
    }
  }
};

function *commit (ctx, sess, sid, opts, Session) {
  debug('begin commit');

  // new and not accessed
  if (undefined === sess) return;

  // removed
  if (false === sess) {
    ctx.cookies.set(opts.key, '', opts);
    if (sid) yield Session.remove(sid);
    return;
  }

  // save session only if changed
  if (!sess.$isDirty()) return;

  debug('store id=%s %j', sid, sess);
  ctx.cookies.set(opts.key, sid, opts);
  yield sess.$thunk();
}
