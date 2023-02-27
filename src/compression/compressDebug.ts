import fs from "fs";

import { compressRpcPackets, decompressRpcPackets } from "./vtcompression.js";

// DEBUG VTGR FILE
/*
const chunks = [
	{
		"start": 0,
		"length": 304669
	},
	{
		"start": 304669,
		"length": 262112
	},
	{
		"start": 566781,
		"length": 320505
	},
	{
		"start": 887286,
		"length": 325980
	},
	{
		"start": 1213266,
		"length": 380464
	},
	{
		"start": 1593730,
		"length": 416004
	},
	{
		"start": 2009734,
		"length": 334381
	},
	{
		"start": 2344115,
		"length": 310172
	},
	{
		"start": 2654287,
		"length": 335219
	},
	{
		"start": 2989506,
		"length": 376293
	},
	{
		"start": 3365799,
		"length": 266500
	},
	{
		"start": 3632299,
		"length": 259040
	},
	{
		"start": 3891339,
		"length": 255984
	},
	{
		"start": 4147323,
		"length": 265033
	},
	{
		"start": 4412356,
		"length": 276203
	},
	{
		"start": 4688559,
		"length": 310091
	},
	{
		"start": 4998650,
		"length": 335413
	},
	{
		"start": 5334063,
		"length": 406270
	},
	{
		"start": 5740333,
		"length": 472414
	},
	{
		"start": 6212747,
		"length": 532625
	},
	{
		"start": 6745372,
		"length": 440257
	},
	{
		"start": 7185629,
		"length": 358458
	},
	{
		"start": 7544087,
		"length": 300681
	},
	{
		"start": 7844768,
		"length": 390541
	},
	{
		"start": 8235309,
		"length": 326049
	},
	{
		"start": 8561358,
		"length": 316141
	},
	{
		"start": 8877499,
		"length": 321953
	},
	{
		"start": 9199452,
		"length": 302116
	},
	{
		"start": 9501568,
		"length": 333182
	},
	{
		"start": 9834750,
		"length": 445156
	},
	{
		"start": 10279906,
		"length": 407888
	},
	{
		"start": 10687794,
		"length": 464399
	},
	{
		"start": 11152193,
		"length": 509398
	},
	{
		"start": 11661591,
		"length": 540665
	},
	{
		"start": 12202256,
		"length": 475932
	},
	{
		"start": 12678188,
		"length": 466207
	},
	{
		"start": 13144395,
		"length": 428840
	},
	{
		"start": 13573235,
		"length": 377393
	},
	{
		"start": 13950628,
		"length": 466020
	},
	{
		"start": 14416648,
		"length": 482986
	},
	{
		"start": 14899634,
		"length": 544954
	},
	{
		"start": 15444588,
		"length": 592845
	},
	{
		"start": 16037433,
		"length": 638164
	},
	{
		"start": 16675597,
		"length": 588897
	},
	{
		"start": 17264494,
		"length": 598042
	},
	{
		"start": 17862536,
		"length": 646994
	},
	{
		"start": 18509530,
		"length": 685931
	},
	{
		"start": 19195461,
		"length": 571448
	},
	{
		"start": 19766909,
		"length": 654170
	},
	{
		"start": 20421079,
		"length": 601136
	},
	{
		"start": 21022215,
		"length": 638401
	},
	{
		"start": 21660616,
		"length": 741275
	},
	{
		"start": 22401891,
		"length": 763725
	},
	{
		"start": 23165616,
		"length": 696170
	},
	{
		"start": 23861786,
		"length": 772434
	},
	{
		"start": 24634220,
		"length": 757480
	},
	{
		"start": 25391700,
		"length": 720445
	},
	{
		"start": 26112145,
		"length": 836592
	},
	{
		"start": 26948737,
		"length": 774802
	},
	{
		"start": 27723539,
		"length": 716667
	},
	{
		"start": 28440206,
		"length": 775355
	},
	{
		"start": 29215561,
		"length": 689588
	},
	{
		"start": 29905149,
		"length": 723463
	},
	{
		"start": 30628612,
		"length": 712138
	},
	{
		"start": 31340750,
		"length": 750648
	},
	{
		"start": 32091398,
		"length": 584835
	},
	{
		"start": 32676233,
		"length": 604688
	},
	{
		"start": 33280921,
		"length": 534331
	},
	{
		"start": 33815252,
		"length": 634081
	},
	{
		"start": 34449333,
		"length": 532248
	},
	{
		"start": 34981581,
		"length": 560352
	},
	{
		"start": 35541933,
		"length": 553069
	},
	{
		"start": 36095002,
		"length": 588971
	},
	{
		"start": 36683973,
		"length": 608728
	},
	{
		"start": 37292701,
		"length": 605778
	},
	{
		"start": 37898479,
		"length": 623852
	},
	{
		"start": 38522331,
		"length": 692311
	},
	{
		"start": 39214642,
		"length": 764819
	},
	{
		"start": 39979461,
		"length": 713031
	},
	{
		"start": 40692492,
		"length": 596302
	},
	{
		"start": 41288794,
		"length": 606833
	},
	{
		"start": 41895627,
		"length": 581327
	},
	{
		"start": 42476954,
		"length": 506903
	},
	{
		"start": 42983857,
		"length": 500907
	},
	{
		"start": 43484764,
		"length": 515518
	},
	{
		"start": 44000282,
		"length": 558670
	},
	{
		"start": 44558952,
		"length": 560112
	},
	{
		"start": 45119064,
		"length": 571033
	},
	{
		"start": 45690097,
		"length": 686809
	},
	{
		"start": 46376906,
		"length": 724746
	},
	{
		"start": 47101652,
		"length": 630481
	},
	{
		"start": 47732133,
		"length": 620921
	},
	{
		"start": 48353054,
		"length": 632979
	},
	{
		"start": 48986033,
		"length": 696326
	},
	{
		"start": 49682359,
		"length": 590394
	},
	{
		"start": 50272753,
		"length": 552435
	},
	{
		"start": 50825188,
		"length": 650759
	},
	{
		"start": 51475947,
		"length": 690108
	},
	{
		"start": 52166055,
		"length": 736973
	},
	{
		"start": 52903028,
		"length": 794720
	},
	{
		"start": 53697748,
		"length": 804617
	},
	{
		"start": 54502365,
		"length": 876178
	},
	{
		"start": 55378543,
		"length": 823189
	},
	{
		"start": 56201732,
		"length": 724268
	},
	{
		"start": 56926000,
		"length": 729903
	},
	{
		"start": 57655903,
		"length": 766692
	},
	{
		"start": 58422595,
		"length": 797965
	},
	{
		"start": 59220560,
		"length": 865725
	},
	{
		"start": 60086285,
		"length": 748311
	},
	{
		"start": 60834596,
		"length": 719588
	},
	{
		"start": 61554184,
		"length": 802574
	},
	{
		"start": 62356758,
		"length": 715019
	},
	{
		"start": 63071777,
		"length": 834088
	},
	{
		"start": 63905865,
		"length": 745779
	},
	{
		"start": 64651644,
		"length": 657737
	},
	{
		"start": 65309381,
		"length": 828635
	},
	{
		"start": 66138016,
		"length": 770210
	},
	{
		"start": 66908226,
		"length": 762999
	},
	{
		"start": 67671225,
		"length": 766540
	},
	{
		"start": 68437765,
		"length": 921198
	}
];


const data = fs.readFileSync("../../data.bin", "binary");
const bytes = data.split("").map(c => c.charCodeAt(0));

const totalStats: Record<string, number> = {};

chunks.forEach((chunk, idx) => {
	const start = chunk.start;
	const end = start + chunk.length;
	const chunkBytes = bytes.slice(start, end);
	const rpcs = decompressRpcPackets(chunkBytes);
	const { stats } = compressRpcPacketsWithStats(rpcs);
	for (let key in stats) {
		if (!totalStats[key]) totalStats[key] = 0;
		totalStats[key] += stats[key];
	}
	// console.log(`Chunk ${idx} has ${rpcs.length} RPCs`);
});

let totalBytes = 0;
for (let key in totalStats) {
	totalBytes += totalStats[key];
}
console.log(`Total bytes: ${totalBytes}`);
for (let key in totalStats) {
	console.log(`${key}: ${totalStats[key]} (${(totalStats[key] / totalBytes * 100).toFixed(2)}%)`);
}
*/


// DEBUG RAW BYTES
// const data = _data as number[];
// fs.writeFileSync("../../data.bin", Buffer.from(data));
// const decompressed = decompressRpcPackets(data);

// DEBUG COMPRESSION
const packets = JSON.parse(fs.readFileSync("../../resync.json", "utf8"));
const compressed = fs.readFileSync("../../resync.bin", "binary").split("").map(c => c.charCodeAt(0));
const resultCompressed = compressRpcPackets(packets, true);

// fs.writeFileSync("../../resync-out.bin", Buffer.from(resultCompressed));
// fs.writeFileSync("../../delta.bin", Buffer.from(resultCompressed.map((c, i) => c - compressed[i])));
// fs.writeFileSync("../../what.txt", resultCompressed.join("\n"));
// for (let i = 0; i < compressed.length; i++) {
// 	if (compressed[i] !== resultCompressed[i]) {
// 		console.log(`Mismatch at ${i}, expected ${compressed[i]}, got ${resultCompressed[i]}`);
// 		break;
// 	}
// }

const result = decompressRpcPackets(resultCompressed);
// console.log(result.length, packets.length);
console.log(JSON.stringify(result) == JSON.stringify(packets) ? "OK" : "FAIL");