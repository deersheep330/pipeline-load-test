module.exports = {
    sleep: function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    },
    to: function(promise) {
        return promise.then(data => {
            return [null, data];
        })
        .catch(err => [err]);
    }
}