"""青溪晨曲，原创八小节拨弦循环及三声叩门。用 ffmpeg 编码为游戏音源。"""
import math
import random
import struct
import subprocess
import wave
from pathlib import Path
from tempfile import TemporaryDirectory

rate = 22050
beat = .51
score = [67, 69, 72, 0, 74, 72, 69, 0, 67, 0, 64, 67, 69, 0, 0, 0,
         72, 74, 76, 0, 74, 72, 69, 67, 64, 67, 69, 0, 67, 0, 0, 0]
def pluck(track, start, midi, level):
    freq = 440 * 2 ** ((midi - 69) / 12)
    for i in range(min(int(rate * 1.8), len(track) - start)):
        t = i / rate
        phase = 2 * math.pi * freq * t
        sound = math.sin(phase) + .33 * math.sin(2 * phase) + .13 * math.sin(3.01 * phase)
        track[start + i] += level * sound * min(1, t * 70) * math.exp(-3.2 * t)
def encode(track, target):
    with TemporaryDirectory() as tmp:
        path = Path(tmp) / 'take.wav'
        with wave.open(str(path), 'wb') as w:
            w.setparams((1, 2, rate, 0, 'NONE', ''))
            w.writeframes(b''.join(struct.pack('<h', int(28000 * max(-1,min(1,x)))) for x in track))
        subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(path),'-q:a','4',target],check=True)
track = [0.] * round(len(score)*beat*rate)
for i, note in enumerate(score):
    if note: pluck(track, round(i*beat*rate), note, .36)
    if i%4==0: pluck(track, round(i*beat*rate), [48,55,52,50][(i//4)%4], .30)
encode(track,'assets/sounds/bgm_main.mp3')
rng = random.Random(22)
knocks = [0.] * rate
for offset in (0,.30,.65):
    for i in range(int(rate*.22)):
        t=i/rate
        knocks[int(offset*rate)+i]=math.exp(-27*t)*(.55*math.sin(2*math.pi*98*t)+.32*math.sin(2*math.pi*191*t)+.12*rng.uniform(-1,1))
encode(knocks,'assets/sounds/knock.mp3')

# 同一旋律降调、放慢、削去明亮高频，作为第二日的变奏。
subprocess.run(['ffmpeg','-loglevel','error','-y','-i','assets/sounds/bgm_main.mp3',
                '-af','asetrate=32000,aresample=44100,atempo=0.84,lowpass=f=1250',
                'assets/sounds/bgm_dusk.mp3'],check=True)
# 第三日只剩炉火。固定噪声种子可重复生成同一片声景。
subprocess.run(['ffmpeg','-loglevel','error','-y','-f','lavfi','-i',
                'anoisesrc=color=brown:amplitude=0.3:duration=12:seed=30','-af',
                'lowpass=f=650,afade=t=in:d=0.4,afade=t=out:st=11.4:d=0.6',
                'assets/sounds/bgm_embers.mp3'],check=True)
