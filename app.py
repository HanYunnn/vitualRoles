import os
import streamlit as st
from PIL import Image, ImageDraw, ImageFont
import time

# 設定 Streamlit 頁面為寬版
st.set_page_config(
    page_title="黑貓 Podcast 影音編輯器 (終極測試版)",
    page_icon="🐈‍⬛",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 確保必要的目錄存在
os.makedirs("broll_assets", exist_ok=True)
os.makedirs("generated_assets", exist_ok=True)

# --- 假資料 (Mock Data) 定義 ---
MOCK_SUBTITLES = [
    {"start": 0.0, "end": 2.5, "text": "今天我們來聊聊，在團隊合作中"},
    {"start": 2.5, "end": 5.0, "text": "大家最容易遇到的溝通痛點是什麼呢？"},
    {"start": 5.0, "end": 7.5, "text": "其實很多時候，並不是大家不想解決問題，"},
    {"start": 7.5, "end": 10.0, "text": "而是每個人看待事情的角度不同。"},
    {"start": 10.0, "end": 12.5, "text": "這就導致了難以彌補的資訊落差。"},
    {"start": 12.5, "end": 15.0, "text": "今天就讓我來分享三個實用的溝通技巧。"}
]

MOCK_BROLL_PLAN = [
    {"start": 5.0, "end": 12.5, "query": "office teamwork discussion", "video_path": "broll_assets/broll_0_office.mp4"}
]

def wrap_chinese_text(text, max_chars):
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n" + text[max_chars:]

def generate_subtitle_preview_image(text, font_size_ratio, text_color, outline_color, outline_width, margin_v_ratio, max_chars_per_line):
    w, h = 360, 640
    img = Image.new("RGB", (w, h), (20, 20, 24))
    draw = ImageDraw.Draw(img)
    draw.ellipse([80, 200, 280, 400], fill=(50, 50, 56), outline=(80, 80, 88), width=1)
    draw.rectangle([110, 400, 250, 500], fill=(50, 50, 56), outline=(80, 80, 88), width=1)
        
    wrapped_text = wrap_chinese_text(text, max_chars_per_line)
    font_size = int(h * font_size_ratio)
    try:
        font = ImageFont.load_default()
    except:
        pass
        
    bbox = draw.textbbox((0, 0), wrapped_text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    x = (w - text_w) / 2
    y = h - text_h - int(h * margin_v_ratio)
    
    draw.text((x, y), wrapped_text, font=font, fill=text_color, stroke_width=outline_width, stroke_fill=outline_color)
    return img

# --- 初始化 Session State ---
if "current_step" not in st.session_state:
    st.session_state.current_step = 1
if "workflow_mode" not in st.session_state:
    st.session_state.workflow_mode = "全自動生成"
if "subtitles" not in st.session_state:
    st.session_state.subtitles = []
if "broll_plan" not in st.session_state:
    st.session_state.broll_plan = []
if "is_mock_generated" not in st.session_state:
    st.session_state.is_mock_generated = False
if "selected_sub_idx" not in st.session_state:
    st.session_state.selected_sub_idx = 0

def reset_to_step_1():
    st.session_state.current_step = 1
    st.session_state.is_mock_generated = False
    st.session_state.subtitles = []
    st.session_state.broll_plan = []

# ==========================================================
# PHASE 1: 素材準備與確認 (Fast Mock)
# ==========================================================
if st.session_state.current_step == 1:
    st.title("Phase 1: 素材生成與準備 (Fast Mock) 🎬")
    st.caption("此版本為 UI 測試版，所有生成都會在 0.1 秒內完成假資料填充。")
    
    st.session_state.workflow_mode = st.radio(
        "你的影片素材來源是？", 
        ["我需要從頭開始生成 (AI 生成)", "我已經有現成的影片檔 (.mp4)"],
        horizontal=True
    )
    
    st.divider()
    
    if st.session_state.workflow_mode == "我需要從頭開始生成 (AI 生成)":
        with st.container(border=True):
            st.header("1. 角色與場景準備")
            script_text = st.text_area("Podcast 文稿", height=80, value="今天我們來聊聊，在團隊合作中，大家最容易遇到的溝通痛點是什麼呢？")
            
            if st.button("🎨 (Mock) 開始生成角色與背景", type="primary"):
                with st.spinner("極速模擬生成中..."):
                    time.sleep(0.1)
                    st.session_state.is_mock_generated = True
                    st.success("假資料素材生成完畢！")

        if st.session_state.is_mock_generated:
            with st.container(border=True):
                st.header("2. AI 影片生成結果確認")
                
                col_down1, col_down2 = st.columns(2)
                with col_down1:
                    st.markdown("**綠幕前景對嘴影片 (Hedra Mock)**")
                    st.info("播放器佔位：這裡會顯示 Hedra 生成的影片。")
                with col_down2:
                    st.markdown("**背景影片/圖片 (Kling Mock)**")
                    st.info("播放器佔位：這裡會顯示 Kling 生成的影片。")

            if st.button("素材確認無誤，進入腳本剪輯器 ➡️", type="primary", use_container_width=True):
                with st.spinner("模擬 Whisper 辨識中..."):
                    time.sleep(0.1)
                    import copy
                    st.session_state.subtitles = copy.deepcopy(MOCK_SUBTITLES)
                    st.session_state.broll_plan = copy.deepcopy(MOCK_BROLL_PLAN)
                    st.session_state.current_step = 2
                    st.rerun()
                    
    else:
        with st.container(border=True):
            st.header("上傳主影片素材")
            uploaded_main = st.file_uploader("選擇你的 .mp4 檔案", type=["mp4"])
            if uploaded_main:
                st.info("上傳成功。")
                if st.button("確認素材，進入腳本剪輯器 ➡️", type="primary", use_container_width=True):
                    with st.spinner("模擬 Whisper 辨識中..."):
                        time.sleep(0.1)
                        import copy
                        st.session_state.subtitles = copy.deepcopy(MOCK_SUBTITLES)
                        st.session_state.broll_plan = []
                        st.session_state.current_step = 2
                        st.rerun()

# ==========================================================
# PHASE 2: 左/右非對稱版面 (固定監視器 + 獨立捲動時間軸)
# ==========================================================
elif st.session_state.current_step == 2:
    col_t1, col_t2 = st.columns([1, 8])
    with col_t1:
        if st.button("⬅️ 返回 Phase 1"):
            reset_to_step_1()
            st.rerun()
    with col_t2:
        st.title("Phase 2: 專業剪輯工作站 🎛️")

    # 核心佈局：左側 40% (固定) / 右側 60% (捲動)
    col_left, col_right = st.columns([4, 6])

    with col_left:
        # 左上：監視器 (適當比例)
        with st.container(border=True):
            st.subheader("📺 節目監視器")
            
            curr_idx = st.session_state.selected_sub_idx
            if curr_idx >= len(st.session_state.subtitles):
                curr_idx = 0
            
            current_sub = st.session_state.subtitles[curr_idx]
            current_text = current_sub["text"]
            current_time = current_sub["start"]
            
            mon_left, mon_center, mon_right = st.columns([1, 4, 1])
            with mon_center:
                # 初始預設樣式
                if "font_size_ratio" not in st.session_state:
                    st.session_state.font_size_ratio = 0.035
                    st.session_state.text_color = "#FFFFFF"
                    st.session_state.outline_color = "#000000"
                    st.session_state.outline_width = 3
                    st.session_state.margin_v_ratio = 0.12
                    st.session_state.max_chars_per_line = 15
                
                preview_img = generate_subtitle_preview_image(
                    text=current_text,
                    font_size_ratio=st.session_state.font_size_ratio,
                    text_color=st.session_state.text_color,
                    outline_color=st.session_state.outline_color,
                    outline_width=st.session_state.outline_width,
                    margin_v_ratio=st.session_state.margin_v_ratio,
                    max_chars_per_line=st.session_state.max_chars_per_line
                )
                st.image(preview_img, caption=f"對齊時間點：{current_time:.2f}s", use_container_width=True)
                
        # 左下：字幕屬性面板
        with st.container(border=True):
            st.subheader("🎨 字幕樣式屬性")
            
            st.session_state.font_size_ratio = st.slider("字型大小", 0.01, 0.08, st.session_state.font_size_ratio, step=0.005)
            
            col_c1, col_c2 = st.columns(2)
            with col_c1:
                st.session_state.text_color = st.color_picker("字體顏色", st.session_state.text_color)
            with col_c2:
                st.session_state.outline_color = st.color_picker("外框顏色", st.session_state.outline_color)
                
            st.session_state.outline_width = st.slider("外框寬度", 0, 10, st.session_state.outline_width)
            st.session_state.margin_v_ratio = st.slider("離底邊距", 0.05, 0.25, st.session_state.margin_v_ratio, step=0.01)
            st.session_state.max_chars_per_line = st.slider("單行字數限制", 5, 30, st.session_state.max_chars_per_line)

            st.divider()
            if st.button("✅ 剪輯完畢，開始渲染 (Phase 3) ➡️", type="primary", use_container_width=True):
                st.session_state.current_step = 3
                st.rerun()

    with col_right:
        # 重點：鎖定高度 700px 的可捲動容器
        with st.container(height=800, border=True):
            st.subheader("🎞️ 時間軸編輯區 (Timeline)")
            st.caption("獨立捲動視窗：在這裡上下翻找台詞，左側監視器將永遠保持在視野內。")
            
            tab_sub, tab_broll = st.tabs(["💬 字幕軌 (Subtitles)", "🎥 B-Roll 軌 (Overlay)"])
            
            with tab_sub:
                st.markdown("**台詞微調與排版**")
                for i, seg in enumerate(st.session_state.subtitles):
                    is_selected = (st.session_state.selected_sub_idx == i)
                    border_color = "#30D158" if is_selected else "#333333"
                    bg_color = "#1E2A22" if is_selected else "transparent"
                    
                    html_card = f"""
                    <div style="border: 1px solid {border_color}; background-color: {bg_color}; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
                    """
                    st.markdown(html_card, unsafe_allow_html=True)
                    
                    c1, c2, c3 = st.columns([2, 5, 2])
                    with c1:
                        # 將按鈕放前面，方便點選對齊
                        if st.button(f"👁️ 對齊 {seg['start']:.1f}s", key=f"align_{i}", use_container_width=True):
                            st.session_state.selected_sub_idx = i
                            st.rerun()
                        
                        new_start = st.number_input("起點", value=float(seg["start"]), step=0.1, key=f"s_start_{i}")
                        new_end = st.number_input("終點", value=float(seg["end"]), step=0.1, key=f"s_end_{i}")
                        if new_start != seg["start"] or new_end != seg["end"]:
                            st.session_state.subtitles[i]["start"] = new_start
                            st.session_state.subtitles[i]["end"] = new_end
                            
                    with c2:
                        new_text = st.text_area("編輯文字", value=seg["text"], height=100, key=f"s_txt_{i}", label_visibility="collapsed")
                        if new_text != seg["text"]:
                            st.session_state.subtitles[i]["text"] = new_text
                            
                    with c3:
                        st.caption(f"長度: {(seg['end'] - seg['start']):.1f}s")
                    
                    st.markdown("</div>", unsafe_allow_html=True)

            with tab_broll:
                st.markdown("**獨立 B-Roll 事件列表** (可橫跨任意長度的台詞)")
                
                if st.button("➕ 新增獨立 B-Roll 片段"):
                    st.session_state.broll_plan.append({"start": 0.0, "end": 5.0, "query": "new search", "video_path": ""})
                    st.rerun()
                    
                for i, broll in enumerate(st.session_state.broll_plan):
                    html_broll = f"""
                    <div style="border: 1px solid #0050A0; background-color: #0A1929; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
                    """
                    st.markdown(html_broll, unsafe_allow_html=True)
                    
                    bc1, bc2, bc3 = st.columns([2, 4, 1])
                    with bc1:
                        b_start = st.number_input("出現時間 (秒)", value=float(broll["start"]), step=0.1, key=f"b_start_{i}")
                        b_end = st.number_input("結束時間 (秒)", value=float(broll["end"]), step=0.1, key=f"b_end_{i}")
                        if b_start != broll["start"] or b_end != broll["end"]:
                            st.session_state.broll_plan[i]["start"] = b_start
                            st.session_state.broll_plan[i]["end"] = b_end
                    with bc2:
                        new_query = st.text_input("搜尋 Pexels / 影片註解", value=broll["query"], key=f"b_query_{i}")
                        if new_query != broll["query"]:
                            st.session_state.broll_plan[i]["query"] = new_query
                        st.caption("你可以在這裡獨立設定影片覆蓋的時間軸，不受字幕切割影響。")
                    with bc3:
                        if st.button("🗑️ 刪除", key=f"b_del_{i}", use_container_width=True):
                            st.session_state.broll_plan.pop(i)
                            st.rerun()
                    
                    st.markdown("</div>", unsafe_allow_html=True)

# ==========================================================
# PHASE 3: 最終合成與導出 (Fast Mock)
# ==========================================================
elif st.session_state.current_step == 3:
    col_t1, col_t2 = st.columns([1, 8])
    with col_t1:
        if st.button("⬅️ 返回 Phase 2"):
            st.session_state.current_step = 2
            st.rerun()
    with col_t2:
        st.title("Phase 3: 最終渲染與導出 (Fast Mock) 🏁")
        
    with st.container(border=True):
        st.header("高品質影片渲染器")
        
        if st.button("▶️ (Mock) 開始渲染", type="primary", use_container_width=True):
            with st.spinner("模擬編碼中 (0.1秒)..."):
                time.sleep(0.1)
                st.success("🎉 (Mock) 影片渲染成功！如果你對此版面感到滿意，我們接下來就會將真實 API 接入這個框架。")
                
        st.divider()
        if st.button("🔄 結束，回到 Phase 1"):
            reset_to_step_1()
            st.rerun()
