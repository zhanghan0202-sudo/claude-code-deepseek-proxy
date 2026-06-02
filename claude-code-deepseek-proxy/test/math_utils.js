/**
 * Math utilities for dual-agent testing.
 */

// TODO: Implement the Fibonacci function
// It should return the nth Fibonacci number (0-indexed: fib(0)=0, fib(1)=1, fib(2)=1, fib(3)=2...)
function fibonacci(n) {
    if (n < 0) return undefined;
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
        const temp = a + b;
        a = b;
        b = temp;
    }
    return b;
}

// TODO: Implement the prime checker function
// It should return true if n is prime, and false otherwise.
function isPrime(n) {
    if (n <= 1) return false;
    if (n <= 3) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    for (let i = 5; i * i <= n; i += 6) {
        if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
}

module.exports = {
    fibonacci,
    isPrime
};
