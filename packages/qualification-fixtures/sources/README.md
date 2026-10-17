# Original media seed

`screen-marker.webm` was generated from FFmpeg's synthetic `testsrc2` and `sine` sources. It contains no camera, microphone, third-party stock media, downloaded model or personal content. The video is a test pattern with the frame index drawn over it; the audio has a 1 kHz pulse during the first tenth of each source second.

The source program lasts two seconds. The checked encoding is VP8 at 1280 x 720 and 30 fps, with mono 48 kHz Vorbis audio. `ffprobe` reports a 2.003-second encoded duration and 116,192 bytes; container/codec padding means the duration is not exactly the nominal source duration. Browser A/V measurement must observe the decoded markers and account for the actual media timeline.

The seed was encoded using FFmpeg `6.1.1-3ubuntu5` with this command, run from the repository root:

```sh
ffmpeg -hide_banner -loglevel error \
  -f lavfi -i testsrc2=size=1280x720:rate=30:duration=2 \
  -f lavfi -i sine=frequency=1000:sample_rate=48000:duration=2 \
  -filter_complex '[1:a]volume=0.12*lt(mod(t\,1)\,0.1):eval=frame[a]' \
  -map 0:v -map '[a]' \
  -vf "drawtext=text='frame %{n}':fontsize=56:fontcolor=white:box=1:boxcolor=black@0.8:x=40:y=40" \
  -c:v libvpx -b:v 450k -threads 1 -c:a libvorbis -b:a 64k \
  -map_metadata -1 -fflags +bitexact -flags:v +bitexact -flags:a +bitexact \
  -y packages/qualification-fixtures/sources/screen-marker.webm
```

Different encoders, fonts or native-library versions may produce different bytes. Regular fixture regeneration **copies this checked seed** and does not need FFmpeg. Re-encoding it changes the asset digest and therefore the comparison inputs; create a new fixture version and rerun both candidates for a new comparison. Do not replace the seed silently after measurements.

Project ownership/licensing follows the repository's current `UNLICENSED` status. This provenance record does not grant rights to unrelated supplier assets or impose supplier-specific capability gates.
