var fs = require('fs');
var c = fs.readFileSync('f:/CampusOS/thu-info-app/packages/thu-info-lib/src/constants/strings.ts', 'utf8');

// 获取当前 SPORTS URL 中的 hash
var m = c.match(/http\/([\da-zA-Z]+)\/gymbook/);
if (m) {
    console.log('Current SPORTS hash:', m[1]);
    console.log('Length:', m[1].length);
}

// 获取 www.sports 的 hash (从 network.ts)
var n = fs.readFileSync('f:/CampusOS/thu-info-app/packages/thu-info-lib/src/utils/network.ts', 'utf8');
var m2 = n.match(/www\.sports[\s\S]*?"(a3[\da-zA-Z]+)"/);
if (m2) {
    console.log('www.sports hash:', m2[1]);
    console.log('Length:', m2[1].length);
}
