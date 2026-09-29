// The circus's fifty, after everything they are made of. Which of its seeds each level plays: of ninety, the ones whose
// difficulty score (tools/marble/czscore.js, the best path over ninety seeds each) climbs steadily from 151 to 200.
const CZ_VARIANT = {151:8, 152:52, 153:83, 154:5, 155:42, 156:40, 157:73, 158:42, 159:59, 160:17, 161:72, 162:15, 163:62, 164:3, 165:72, 166:32, 167:36, 168:9, 169:9, 170:44, 171:9, 172:27, 173:13, 174:2, 175:69, 176:65, 177:60, 178:43, 179:45, 180:62, 181:53, 182:40, 183:79, 184:61, 185:54, 186:60, 187:38, 188:83, 189:66, 190:55, 191:70, 192:67, 193:79, 194:65, 195:50, 196:20, 197:86, 198:85, 199:46, 200:79};
for (let n = 151; n <= 200; n++) LEVELS.push(makeLevel(n, CZ_VARIANT[n] || 0));
// Their star times, raced as the machine's were (quick and clean, the short way at a fork, +6% or a second, rounded up,
// and under the careful run), 2026-09-30; 199 raced a touch slower (at 7 the autopilot clipped a carousel horse).
if (STAR_TIMES.length !== 150) throw new Error('star times: ' + STAR_TIMES.length + ' before the circus');
STAR_TIMES.push(84, 85, 103, 101, 108, 108, 133, 132, 116, 149, 139, 148, 156, 141, 163, 171, 167, 155, 173, 179, 176, 165, 151, 214, 182, 195, 175, 189, 198, 171, 325, 232, 310, 206, 238, 301, 272, 305, 283, 310, 243, 303, 273, 227, 353, 232, 274, 343, 265, 276);
