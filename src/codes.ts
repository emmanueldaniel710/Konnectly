/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const ORIGINAL_CODES = [
    "Xk9#mP2$qL5@nR7&vB3!zC8^yF1?jH6", "DEMO456", "ADMIN789", "FREE001", "OPEN999",
    "A7B3K9X2", "M4N8P1Q5", "R6T2U9W3", "Y1C5V7B4", "L9J2H6G8", "F4D1S3A7", "Z8X2C5V6",
    "B3N7M1K9", "Q4W6E8R2", "T9Y1U4I7", "H2K5L9P3", "D6F8G1J4", "W3E7R9T2", "U5I8O0Z1",
    "X2C4V6B8", "5YKK6FK", "1F1L132", "L9KQ14", "FHU5RH", "7JYY8L", "6KIVNO5G", "E1R4T7Y9",
    "BTSG3SH", "I77UTLZR", "UMOI9M", "HOAIJ0S", "4Y2PCY5", "WAG948KA", "TDCQ3AL9", "0AQRWN9",
    "TWDU1NAW", "F2Z5UFT", "AD9ADKI", "FPR3J5J", "2KVS2U", "49AYIJJ", "J1PIIH", "GFOAEF6",
    "HL5709Y", "KGFR5BM7", "2HSPHA5", "VNFILTC", "CWT8NEDW", "5GOJTP", "VKDJHG", "ZGE3E78G",
    "HVGZOHKZ", "8TXMR3WY", "H0TX5OU", "LAYP29U", "56X13UN", "CJA0XVY3", "9R7S7Q", "WE94XGKY",
    "C2RMHW", "18I7B7CX", "1AEJOEF1", "W9WQA21", "THXXZY", "5LXZBL35", "CQ1R16", "3MYNCD4M",
    "HGB5BUXO", "E9UW3KPQ", "10TV4WS5", "5BC6EX", "39JK1AU2", "UA6X818", "W37UCO5X", "XF4HC6W8",
    "8S7535", "IT8SXHVT", "K240PP9X", "I99EAH4U", "Y0NS6V32", "KQLB3S0N", "906VMC", "UNQX7E1A",
    "XTIMZKN", "U6VGJR4", "0MZOIX", "R3Z66AJ", "0NF1DKN", "SVZN2S5", "QQGBAL", "4BYDB10",
    "VP3K8HA7", "SSY4AHRM", "H566UF0", "9KNU140A", "70UE4DDW", "75JCKC", "2D1TVHFQ", "KDEFAT",
    "067S4CT", "C91JUZ9", "S40HM1FT", "7MB3OE", "J3CRX1Z", "26T8ZOC", "66EGR6JR", "V6FJWO",
    "ICMO68E", "USA98E", "726WUQJ", "64G6KOB", "PP6N2M3", "QFBABE", "1ZPQLQ", "JTWJPXZ2",
    "OGH365", "XSZC5X1", "J6YGHLY", "9OYHS9F", "PVYHY8", "0GHG7H", "A590X7M", "1X3FD0K6",
    "T89TKI", "J429TNK6", "BWHXPDMD", "SGNNRQF", "YSPRU2KQ", "9BZAOBCH", "KVTXWO", "UP2JGO1",
    "HADSF2", "RZZOTYYJ", "K63RB470", "97A3CS", "K0NOYM", "LZYVEWDL", "VAITBBE", "U4JZP9",
    "NEHVIVCQ", "S6WTX44I", "WZ7VJ9Y", "B66MHCMB", "M1XKZY", "RLNZ9XH", "PGYUVT", "ALFW34X9",
    "82KY4Y", "1S2QIZB0", "SSJBZN1O", "RUDRIQLB", "XR652KII", "LOFCZ03C", "VQYX26U", "UIDP7T5",
    "X8U8JP6", "3WGJGDN", "FJJ57MP1", "P5X1GIDO", "X1PNM25", "1Y1FU91L", "HCPR22YS", "1A4O17HT",
    "MV7CA9", "LGL3UK3X", "HFJ7J9ZU", "XWKUGOF", "4UJ5BH", "KV8J7GO0", "O7Q82IV", "SJHU5MW",
    "O5Y9RBE1", "9A7XB8", "RZSR6AK", "CO267PZ3", "8J0205", "WSXTYEH", "KCD08VK", "DKWD4Y01",
    "OE851I", "CF8PEW4W", "EFMRGH", "A3XNUL", "ROLG7O8", "L09KAPY", "1NUXGXQ", "AL98360",
    "N876MZIY", "VI5WRCT", "WJCCKDK", "HU1K6LTC", "MSIYYS93", "K8DKUJRR", "FXMXOE", "LBUY3XR",
    "3MXSTV", "TVPK8PK1", "GKJSTWZ", "QMAO0W", "Q53QRC", "LKA6QC9X", "PSFTWL", "CK6CANE",
    "4E2WZE", "PCHT1SK", "S5V7OGE", "82LCLR", "ADYVL6", "ZZCBZL53", "SOJ7IK", "R1PHOS6",
    "5C4IVVP", "C0P3HWLA", "QZG2YP", "733MYZV1", "FUKGAV", "9K0NXU", "KBBFVS", "UOS6DV0",
    "KGJ57P9", "SBKU9M", "HJ64KKOK", "K6GWWTYU", "SFRJMU", "0S6BKS4R", "PLBA9XFK", "KWU9T5PW",
    "OHBYMF", "DA6K66", "RVT0JWHQ", "KDXAS1XU", "NC6HQ2TT", "KN0VHO", "DDF7NU", "DQZJDZ",
    "W5JX7AZ8", "SYCZ7JK", "28XW01CC", "90FO8GPJ"
];

export const MASTER_CODE = "Xk9#mP2$qL5@nR7&vB3!zC8^yF1?jH6";

function mulberry32(seed: number) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function generateRandomCode(length: number, rng: () => number) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(rng() * chars.length));
    }
    return result;
}

export function buildFullCodeList(): string[] {
    const totalNeeded = 20200;
    const existingSet = new Set(ORIGINAL_CODES);
    existingSet.add(MASTER_CODE);
    const allCodes = [...existingSet];
    // Seeded RNG matching the exact seed from index.7
    const rng = mulberry32(0x4B583234);

    while (allCodes.length < totalNeeded) {
        const code = generateRandomCode(8, rng);
        if (!existingSet.has(code)) {
            existingSet.add(code);
            allCodes.push(code);
        }
    }
    return allCodes;
}

export const ALL_CODES = buildFullCodeList();
export const VALID_CODES = new Set(ALL_CODES);

export function isValidCode(code: string): boolean {
    return VALID_CODES.has(code);
}
