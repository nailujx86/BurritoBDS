module.exports = {
    delay: (delay) => {
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}