// Basic Server Example
/* This example starts the server, performs a backup after 15 seconds
and then runs until encountering a SIGINT on which it performs a graceful shutdown. */

let Burrito = require('./index')

var burrito = new Burrito('./server/bedrock_server')
burrito.on("log", (log) => {
    process.stdout.write(log);
})
burrito.start(detached = true);
setTimeout(() => {
    burrito.performBackup();
}, 15000)
process.on('SIGINT', function() {
    burrito.stop(gentle = true).then(() => {process.exit(0)});
});