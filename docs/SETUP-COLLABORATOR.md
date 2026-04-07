# WhisperCUT — Collaborator Setup Guide

## Quick Start (5 นาที)

### 1. Clone repo
```bash
git clone https://github.com/wallpapa/WhisperCUT.git
cd WhisperCUT
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup .env
คัดลอกไฟล์ .env ที่ได้รับมา (ส่งให้ทาง DM) ไปไว้ที่ root ของ project:
```bash
cp .env.waleerat .env
```

### 4. ใส่ AI API Key ของตัวเอง (เลือก 1 แบบ)

#### แบบ A: Gemini Free (แนะนำ — ฟรี 250 req/วัน)
1. ไปที่ https://aistudio.google.com/apikey
2. กด "Create API Key"
3. ใส่ใน `.env`:
```
GEMINI_API_KEY=your-key-here
```

#### แบบ B: OpenRouter Free Models
1. ไปที่ https://openrouter.ai/keys
2. สร้าง API key
3. ใส่ใน `.env`:
```
OPENROUTER_API_KEY=sk-or-v1-your-key
```

#### แบบ C: Local Model (ไม่เสียเงินเลย)
1. ติดตั้ง Ollama:
```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh
```

2. ดาวน์โหลด model:
```bash
# Gemma 4 (แนะนำ — ดีที่สุดสำหรับ Thai content)
ollama pull gemma3:27b

# หรือ model อื่น
ollama pull llama3.2
ollama pull qwen2.5:14b
ollama pull glm4:9b
```

3. รัน Ollama:
```bash
ollama serve
```

4. `.env` ไม่ต้องแก้อะไร — `OLLAMA_BASE_URL` ค่า default ใช้ได้เลย

### 5. Build & Run
```bash
# Build TypeScript
npm run build

# Run MCP server
npm start
```

### 6. เพิ่ม MCP ใน Claude Code
สร้างไฟล์ `~/.claude/.mcp.json`:
```json
{
  "mcpServers": {
    "whispercut": {
      "command": "node",
      "args": ["/path/to/WhisperCUT/dist/mcp/server.js"],
      "cwd": "/path/to/WhisperCUT"
    }
  }
}
```

เปลี่ยน `/path/to/WhisperCUT` เป็น path จริงบนเครื่อง

### 7. ทดสอบ
เปิด Claude Code แล้วลองใช้:
- `whispercut_list_vibes` — ดู vibes ที่มี
- `whispercut_status` — ดู quota + pipeline status
- `whispercut_vibe_edit` — สร้างวิดีโอ

---

## 15 MCP Tools ที่ใช้ได้

| Tool | หน้าที่ |
|------|---------|
| `whispercut_vibe_edit` | สร้างวิดีโอจาก topic + vibe (เครื่องมือหลัก) |
| `whispercut_list_vibes` | ดู 5 vibes + predicted performance |
| `whispercut_analyze` | ถอดเสียง + วิเคราะห์วิดีโอ |
| `whispercut_cut` | สร้าง cut list |
| `whispercut_caption` | ใส่ซับไตเติ้ลไทย |
| `whispercut_render` | Render 1080x1920 60fps |
| `whispercut_export_capcut` | Export เป็น CapCut draft |
| `whispercut_publish` | อัพโหลดขึ้น TikTok |
| `whispercut_feedback` | AI ให้คะแนน + ปรับปรุง |
| `whispercut_study` | วิเคราะห์ช่อง TikTok |
| `whispercut_clone` | สร้าง script จาก style template |
| `whispercut_capcut_clone` | Export clone เป็น CapCut |
| `whispercut_run_pipeline` | Pipeline อัตโนมัติเต็มรูปแบบ |
| `whispercut_schedule` | ตั้งเวลาสร้าง content |
| `whispercut_status` | ดู quota + job status |

---

## Supabase Access

- **Project**: `yemtipemvgxepafrsxhh`
- **URL**: https://yemtipemvgxepafrsxhh.supabase.co
- **Role**: editor (อ่าน/เขียน data ได้)
- ขอเข้า Dashboard ได้ที่ admin

## ปัญหาที่พบบ่อย

**Q: "Error: GEMINI_API_KEY is required"**
A: ใส่ API key ใน .env หรือเปลี่ยนไปใช้ Ollama

**Q: "Ollama connection refused"**
A: รัน `ollama serve` ก่อน

**Q: FFmpeg not found**
A: `brew install ffmpeg` (macOS) หรือ `sudo apt install ffmpeg` (Linux)

**Q: Whisper transcription ช้ามาก**
A: ลองเปลี่ยน `WHISPER_MODEL=base` ใน .env (เล็กกว่า แต่เร็วกว่า)
