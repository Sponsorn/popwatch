"""Synthetic popcorn batch for replay parity checks. Not a substitute for a real
recording: it proves the detector gives the same answer before and after a
change, not that the answer is right.

  python tools/synth-batch.py tools/synth-batch.wav
"""
import math, random, struct, sys, wave

SR = 22050
DUR = 170.0
random.seed(7)

def rate(t):
    # pops per second: nothing until ~40 s, skewed peak around 75 s, long tail
    if t < 40: return 0.0
    x = (t - 40) / 14.0
    return 9.0 * (x ** 2.2) * math.exp(-(x - 1) * 1.9)

n = int(SR * DUR)
buf = [random.gauss(0, 260) for _ in range(n)]   # stove hiss

dt, pops = 0.01, []
for k in range(int(DUR / dt)):
    if random.random() < rate(k * dt) * dt:
        pops.append(k * dt + random.uniform(0, dt))

for p in pops:
    i0, amp = int(p * SR), random.uniform(5000, 14000)
    for j in range(int(0.012 * SR)):
        if i0 + j < n:
            buf[i0 + j] += random.gauss(0, amp) * math.exp(-j / (0.0025 * SR))

with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(s)))) for s in buf))
print(len(pops), "pops written")
