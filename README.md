# koa-mongodb-session

MongoDB backed session middleware for [koa.js](http://koajs.com/)

## Installation

```js
$ npm install koa-mongodb-session
```

## Example

View counter example:

```js
var session = require('koa-mongodb-session');
var mongo = require('mongodb').MongoClient;
var koa = require('koa');

mongo.connect(uri, function(err, db){
  if (err) throw err;

  var app = koa();
  app.keys = ['some secret'];
  app.use(session({
    key: 'sid',
    collection: db.collection('session')
  }));

  app.use(function *(){
    this.session.$inc('views', 1);
    this.body = this.session.views + ' views';
  })

  app.listen(3000);
  console.log('listening on port 3000');
})
```

## Semantics

This module provides "guest" sessions, meaning any visitor will have a session,
authenticated or not. If a session is _new_ a Set-Cookie will be produced regardless
of populating the session.

## API

### Options

A mongodb [collection](http://mongodb.github.io/node-mongodb-native/api-generated/collection.html)
object in which all session objects will be stored is required.

The cookie name is controlled by the `key` option, which defaults
to "sid". All other options are passed to `ctx.cookies.get()` and
`ctx.cookies.set()` allowing you to control security, domain, path,
and signing among other settings.

### Destroying a session

To destroy a session simply set it to `null`:

```js
this.session = null;
```

### Modifying a session

Use the following helper methods to modify a session. These allow us to buffer
atomic operations and perform a single update statement at the end of the
request for efficiency.

If you wish to flush all buffered operations before the end of the request,
simply `yield` your session modifier (works for all modifier methods):

```js
app.use(function *() {
  yield this.session.$set('name', 'koa'); // $set and other buffered ops will be committed to mongodb
})
```

_Note that changing session properties directly (`this.session.x = 3`) will have no effect.
You must use the following $atomic modifier methods._


#### $set(key, val)

Sets `key` to `val`.

```js
app.use(function *() {
  this.session.$set('email', 'aaron.heckmann+github@gmail.com');
})
```

#### $unset(key)

Unsets `key`.

```js
app.use(function *() {
  this.session.$unset('email');
  console.log(this.session.email); // undefined
})
```

#### $inc(key, val)

Increments `key` by `val`.

```js
app.use(function *() {
  this.session.$inc('views', 1);
})
```

Note that negative values are supported for decrementing.

```js
app.use(function *() {
  this.session.$inc('views', -1);
})
```

#### $rename(oldkey, newKey)

Renames `oldKey` to `newKey`.

```js
app.use(function *() {
  this.session.$rename('vews', 'views');
  console.log(this.session.vews)  // undefined
  console.log(this.session.views) // 1
})
```

#### $push(key, val)

Pushes `val` onto the array at `key`. If no array exists it will be created for you.

```js
app.use(function *() {
  this.session.$push('pages', 'pricing');
  this.session.$push('pages', 'features');
  console.log(this.session.pages); // ['pricing', 'features']
})
```

#### $pushAll(key, vals)

Pushes all `vals` onto the array at `key`. If no array exists it will be created for you.

```js
app.use(function *() {
  this.session.$pushAll('pages', ['home', 'contact-us']);
})
```

#### $addToSet(key, vals)

Pushes all `vals` onto the array at `key` if they are not already in the array. If no array exists it will be created for you.

```js
app.use(function *() {
  console.log(this.session.uniquePages); // [5, [37], 12, 2, { x: { y: 'deep' }}]
  this.session.$addToSet('uniquePages', [5, [37], { x:{ y: 'deep' }}, 11, 2]);
  console.log(this.session.uniquePages); // [5, [37], 12, 2, { x: { y: 'deep' }}, 11]
})
```

#### $pull(key, val)

Removes all instances of `val` from the array at `key`.

```js
app.use(function *() {
  console.log(this.session.cart); // ['asdf-123', 'qwer-94']
  this.session.$pull('cart', 'asdf-123');
  console.log(this.session.cart); // ['qwer-94']
})
```

#### $pullAll(key, vals)

Removes all instances of all `vals` from the array at `key`.

```js
app.use(function *() {
  console.log(this.session.cart); // ['asdf-123', 'qwer-94']
  this.session.$pullAll('cart', ['asdf-123', 'qwer-94']);
  console.log(this.session.cart); // []
})
```

#### $pop(key)

Removes the last element of the array at `key`.

```js
app.use(function *() {
  console.log(this.session.queue); // [5435, 2341, 43]
  this.session.$pop('queue');
  console.log(this.session.queue); // [5435, 2341]
})
```

#### $shift(key)

Removes the first element of the array at `key`.

```js
app.use(function *() {
  console.log(this.session.queue); // [5435, 2341, 43]
  this.session.$shift('queue');
  console.log(this.session.queue); // [2341, 43]
})
```

#### $reload()

Returns a `thunk` which can be `yield`ed to reload the session from the state in the db
(blowing away any in-memory changes).

```js
app.use(function *() {
  yield this.session.$reload();
})
```

#### isNew

Returns `true` if the session is new, otherwise false.

```js
app.use(function *() {
  console.log(this.session.isNew);
})
```

### Notes

The session modifiers not only buffer atomic operations for later execution but
also operate directly on the in-memory session object.

```js
app.use(function *() {
  this.session.$set('namme', 'aaron');
  this.session.$rename('namme', 'name');
  console.log(this.session.namme) // undefined
  console.log(this.session.name)  // 'aaron'
})
```

### Error handling

If an error occurs during a database update it will be passed back to `koa`.

## License

[MIT](https://github.com/aheckmann/koa-mongodb-session/blob/master/LICENSE)
