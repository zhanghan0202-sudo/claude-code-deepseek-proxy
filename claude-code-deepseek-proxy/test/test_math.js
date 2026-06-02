const { fibonacci, isPrime } = require('./math_utils');

console.log("--- Testing Fibonacci ---");
const fibTests = [
    { input: 0, expected: 0 },
    { input: 1, expected: 1 },
    { input: 5, expected: 5 },
    { input: 10, expected: 55 }
];

let fibPassed = true;
fibTests.forEach(test => {
    const result = fibonacci(test.input);
    if (result !== test.expected) {
        console.error(`❌ fibonacci(${test.input}) expected ${test.expected}, got ${result}`);
        fibPassed = false;
    } else {
        console.log(`✅ fibonacci(${test.input}) = ${result}`);
    }
});

console.log("\n--- Testing Prime ---");
const primeTests = [
    { input: 1, expected: false },
    { input: 2, expected: true },
    { input: 3, expected: true },
    { input: 4, expected: false },
    { input: 17, expected: true },
    { input: 20, expected: false }
];

let primePassed = true;
primeTests.forEach(test => {
    const result = isPrime(test.input);
    if (result !== test.expected) {
        console.error(`❌ isPrime(${test.input}) expected ${test.expected}, got ${result}`);
        primePassed = false;
    } else {
        console.log(`✅ isPrime(${test.input}) = ${result}`);
    }
});

if (fibPassed && primePassed) {
    console.log("\n🎉 ALL TESTS PASSED!");
    process.exit(0);
} else {
    console.error("\n❌ SOME TESTS FAILED.");
    process.exit(1);
}
