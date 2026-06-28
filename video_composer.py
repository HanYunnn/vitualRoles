import os
import json
import numpy as np
import textwrap
from PIL import Image, ImageDraw, ImageFont
from moviepy import VideoFileClip, CompositeVideoClip, ImageClip, concatenate_videoclips
import moviepy.video.fx as vfx

def format_srt_time(seconds):
    """
    將秒數格式化為 SRT 字幕時間格式 (HH:MM:SS,mmm)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

def generate_srt(segments, output_srt_path):
    """
    從 Whisper 的 JSON 結果生成 SRT 字幕檔案 (供外掛字幕備用)
    """
    if not segments:
        return
    srt_lines = []
    for i, seg in enumerate(segments):
        start = format_srt_time(seg["start"])
        end = format_srt_time(seg["end"])
        text = seg["text"].strip()
        
        srt_lines.append(f"{i + 1}")
        srt_lines.append(f"{start} --> {end}")
        srt_lines.append(text)
        srt_lines.append("")
        
    with open(output_srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(srt_lines))

def wrap_chinese_text(text, max_chars):
    """
    針對中文進行自動換行（每 max_chars 個字換一行）
    """
    if not text:
        return ""
    lines = []
    for i in range(0, len(text), max_chars):
        lines.append(text[i:i+max_chars])
    return "\n".join(lines)

def make_ping_pong_loop(clip, target_duration):
    """
    建立 5 秒影片的鏡像循環 (A -> B -> A -> B) 達到目標長度
    """
    reversed_clip = clip.with_effects([vfx.TimeMirror()])
    loop_unit = concatenate_videoclips([clip, reversed_clip])
    
    n_loops = int(np.ceil(target_duration / loop_unit.duration))
    clips = [loop_unit] * n_loops
    final_loop = concatenate_videoclips(clips).subclipped(0, target_duration)
    return final_loop

def compose_video(
    main_video_path=None,             # 情境 B/C：已有主影片
    foreground_video_path=None,       # 情境 A：綠幕對嘴影片
    background_video_path=None,       # 情境 A：Kling 背景影片
    background_image_path=None,       # 情境 A：Flux 靜態背景圖
    background_mode="none",           # "ping_pong", "ken_burns", "upload_video", "none"
    broll_plan=None,                  # B-Roll 點位計畫表 (為 None 或空清單時不套用 B-Roll)
    segments=None,                    # 字幕段落 (為 None 或空清單時不上字幕)
    output_video_path="final_output_draft.mp4",
    # 字幕樣式自訂
    font_name="PingFang.ttc",
    font_size_ratio=0.035,            # 字型大小比例 (相對於影片高度)
    text_color="#FFFFFF",
    outline_color="#000000",
    outline_width=3,
    margin_v_ratio=0.12,              # 垂直底邊距比例 (相對於影片高度)
    max_chars_per_line=15
):
    """
    核心影片剪輯引擎：支援綠幕去背、動態背景生成、B-Roll 疊加與高客製 Pillow 內嵌字幕。
    """
    clips_to_close = []
    
    # 1. 決定基礎影片 (Base Video)
    if background_mode != "none" and foreground_video_path and os.path.exists(foreground_video_path):
        # --- 情境 A：前景綠幕貓 + 背景合成 ---
        print("🎬 載入前景綠幕對嘴影片...")
        fg_clip = VideoFileClip(foreground_video_path)
        clips_to_close.append(fg_clip)
        
        W, H = fg_clip.size
        duration = fg_clip.duration
        
        # 決定背景圖層
        if background_mode == "ping_pong" and background_video_path and os.path.exists(background_video_path):
            print("🎬 載入 5 秒背景影片並進行鏡像循環處理...")
            bg_raw = VideoFileClip(background_video_path)
            clips_to_close.append(bg_raw)
            # 比例縮放填滿
            scale = max(W / bg_raw.w, H / bg_raw.h)
            bg_resized = bg_raw.resized(scale).cropped(x_center=bg_raw.w*scale/2, y_center=bg_raw.h*scale/2, width=W, height=H)
            bg_clip = make_ping_pong_loop(bg_resized, duration)
            clips_to_close.append(bg_clip)
            
        elif background_mode == "ken_burns" and background_image_path and os.path.exists(background_image_path):
            print("🎬 載入背景靜態圖並套用 Ken Burns (Pan & Zoom) 緩慢運鏡特效...")
            pil_img = Image.open(background_image_path)
            # 確保圖片能蓋住 W, H
            scale_cover = max(W / pil_img.width, H / pil_img.height)
            if scale_cover > 1.0:
                pil_img = pil_img.resize((int(pil_img.width * scale_cover), int(pil_img.height * scale_cover)), Image.Resampling.LANCZOS)
            
            # 透過 transform 動態裁切/放大
            def ken_burns_filter(gf, t):
                scale = 1.0 + 0.10 * (t / duration)
                curr_w = int(W * scale)
                curr_h = int(H * scale)
                resized = pil_img.resize((curr_w, curr_h), Image.Resampling.LANCZOS)
                
                # 緩慢橫向 pan
                max_pan_x = curr_w - W
                dx = int(max_pan_x * 0.5 * (1.0 + 0.05 * np.sin(t * 0.15)))
                dy = int((curr_h - H) * 0.5)
                
                cropped = resized.crop((dx, dy, dx + W, dy + H))
                return np.array(cropped)
                
            bg_clip = ImageClip(background_image_path).with_duration(duration)
            bg_clip = bg_clip.transform(ken_burns_filter)
            clips_to_close.append(bg_clip)
            
        elif background_mode == "upload_video" and background_video_path and os.path.exists(background_video_path):
            print("🎬 載入使用者上傳的背景影片...")
            bg_raw = VideoFileClip(background_video_path)
            clips_to_close.append(bg_raw)
            scale = max(W / bg_raw.w, H / bg_raw.h)
            bg_resized = bg_raw.resized(scale).cropped(x_center=bg_raw.w*scale/2, y_center=bg_raw.h*scale/2, width=W, height=H)
            
            # 如果背景片不夠長就循環，太長就剪短
            if bg_resized.duration < duration:
                n_loops = int(np.ceil(duration / bg_resized.duration))
                bg_clip = concatenate_videoclips([bg_resized] * n_loops).subclipped(0, duration)
            else:
                bg_clip = bg_resized.subclipped(0, duration)
            clips_to_close.append(bg_clip)
        else:
            # 降級方案：純綠幕或黑底
            bg_clip = ImageClip(np.zeros((H, W, 3), dtype=np.uint8)).with_duration(duration)
            clips_to_close.append(bg_clip)
            
        # 進行綠幕去背 Chroma Key 合成
        print("🎬 進行綠幕去背合成...")
        # 綠幕遮罩：Hedra 綠幕一般是 [0, 255, 0]
        fg_masked = fg_clip.with_effects([vfx.MaskColor(color=(0, 255, 0), threshold=40, stiffness=3)])
        
        main_clip = CompositeVideoClip([bg_clip, fg_masked], size=(W, H))
        main_clip.audio = fg_clip.audio
        clips_to_close.append(main_clip)
        
    elif main_video_path and os.path.exists(main_video_path):
        # --- 情境 B/C：已有主影片 ---
        print(f"🎬 載入使用者主影片: {main_video_path}...")
        main_clip = VideoFileClip(main_video_path)
        clips_to_close.append(main_clip)
        W, H = main_clip.size
    else:
        print("❌ 錯誤：沒有提供足夠的影片輸入源。")
        return
        
    # 2. 疊加 B-Roll (若有提供計畫表)
    clips_to_composite = [main_clip]
    
    if broll_plan:
        print("🎬 開始疊加 B-Roll 素材...")
        for i, item in enumerate(broll_plan):
            v_path = item.get("video_path")
            if not v_path or not os.path.exists(v_path):
                continue
                
            start = item["start"]
            end = item["end"]
            duration = end - start
            
            # 載入 B-Roll 并剪輯
            broll_clip = VideoFileClip(v_path).without_audio()
            broll_clip = broll_clip.subclipped(0, min(duration, broll_clip.duration))
            
            # 調整尺寸填滿主畫面 (維持比例)
            scale_w = W / broll_clip.w
            scale_h = H / broll_clip.h
            scale = max(scale_w, scale_h)
            
            broll_clip = broll_clip.resized(scale)
            broll_clip = broll_clip.cropped(x_center=broll_clip.w/2, y_center=broll_clip.h/2, width=W, height=H)
            broll_clip = broll_clip.with_start(start)
            
            clips_to_composite.append(broll_clip)
            clips_to_close.append(broll_clip)
            
    composed_clip = CompositeVideoClip(clips_to_composite, size=(W, H))
    composed_clip.audio = main_clip.audio
    clips_to_close.append(composed_clip)
    
    # 3. 內嵌字幕 (若有提供 segments)
    final_clip = composed_clip
    
    if segments:
        print("🎬 套用字幕繪製濾鏡...")
        
        # 字型載入
        font_path = f"/System/Library/Fonts/{font_name}"
        if not os.path.exists(font_path):
            font_path = "/Library/Fonts/Arial Unicode.ttf"
        if not os.path.exists(font_path):
            font_path = None
            
        def get_subtitle_at_time_local(t):
            for seg in segments:
                if seg["start"] <= t <= seg["end"]:
                    return seg["text"].strip()
            return None
            
        # 影格處理
        def subtitle_filter(gf, t):
            frame = gf(t)
            text = get_subtitle_at_time_local(t)
            if not text:
                return frame
                
            # 自動折行
            wrapped_text = wrap_chinese_text(text, max_chars_per_line)
            
            img = Image.fromarray(frame)
            draw = ImageDraw.Draw(img)
            
            font_size = int(H * font_size_ratio)
            try:
                font = ImageFont.truetype(font_path, font_size) if font_path else ImageFont.load_default()
            except:
                font = ImageFont.load_default()
                
            bbox = draw.textbbox((0, 0), wrapped_text, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            
            x = (W - text_w) / 2
            y = H - text_h - int(H * margin_v_ratio)
            
            draw.text((x, y), wrapped_text, font=font, fill=text_color, stroke_width=outline_width, stroke_fill=outline_color)
            return np.array(img)
            
        final_clip = composed_clip.transform(subtitle_filter)
        clips_to_close.append(final_clip)
        
    # 4. 輸出最終影片
    print(f"🎥 正在渲染影片: {output_video_path}...")
    final_clip.write_videofile(
        output_video_path,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile="temp-audio.m4a",
        remove_temp=True,
        logger="bar"
    )
    
    # 釋放資源
    for clip in clips_to_close:
        try:
            clip.close()
        except:
            pass
            
    print(f"🎉 影片渲染成功！檔案已輸出至: {output_video_path}")
