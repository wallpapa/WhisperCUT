/**
 * CapCut Draft Bridge — Generate draft_info.json from WhisperCUT auto_edit
 *
 * Creates a complete CapCut Desktop project that opens instantly.
 * Path: ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/{name}/
 *
 * Based on reverse engineering of real CapCut Desktop draft (v360000).
 * Only uses 10/48 material types (the ones actually used in real projects).
 * Time unit: microseconds (1 sec = 1,000,000 μs)
 */

import { writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { homedir } from "os";

const MICROSECOND = 1_000_000;

// ── Types ────────────────────────────────────────────────────────

export interface DraftBridgeInput {
  projectName: string;
  // Video/Image clips to place on timeline
  clips: Array<{
    filePath: string;          // absolute path to video/image file
    type: "video" | "photo";
    width: number;
    height: number;
    startOnTimeline: number;   // seconds — when this clip appears
    duration: number;          // seconds — how long it shows
    sourceStart?: number;      // seconds — where in source to start (for video)
    sourceDuration?: number;   // seconds — how much of source to use
  }>;
  // Audio tracks
  audio: Array<{
    filePath: string;
    startOnTimeline: number;   // seconds
    duration: number;          // seconds
    volume?: number;           // 0-1, default 1.0
    name?: string;
  }>;
  // Text overlays (keyword text on screen)
  textOverlays?: Array<{
    text: string;
    startOnTimeline: number;   // seconds
    duration: number;          // seconds
    fontSize?: number;         // default 30
    color?: string;            // hex, default #FFFFFF
    bgAlpha?: number;          // 0-1, default 1.0
  }>;
  // Captions/subtitles
  captions?: Array<{
    text: string;
    startOnTimeline: number;   // seconds
    duration: number;          // seconds
  }>;
  // Canvas config
  width?: number;              // default 1080
  height?: number;             // default 1920
  fps?: number;                // default 30
}

export interface DraftBridgeResult {
  projectPath: string;
  draftInfoPath: string;
  metaInfoPath: string;
  success: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────

function uuid(): string {
  return randomUUID().toUpperCase();
}

function toUs(seconds: number): number {
  return Math.round(seconds * MICROSECOND);
}

function makeSegment(materialId: string, targetStart: number, targetDuration: number, sourceStart = 0, sourceDuration?: number): Record<string, unknown> {
  return {
    caption_info: null,
    cartoon: false,
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0.0,
      scale: { x: 1.0, y: 1.0 },
      transform: { x: 0.0, y: 0.0 },
    },
    color_correct_alg_result: null,
    common_keyframes: [],
    desc: "",
    digital_human_template_group_id: "",
    enable_adjust: true,
    enable_adjust_mask: false,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_hsl: false,
    enable_lut: true,
    enable_smart_color_adjust: false,
    enable_video_mask: true,
    extra_material_refs: [],
    group_id: "",
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    id: uuid(),
    intensifies_audio: false,
    is_loop: false,
    is_placeholder: false,
    is_tone_modify: false,
    keyframe_refs: [],
    last_nonzero_volume: 1.0,
    lyric_keyframes: null,
    material_id: materialId,
    raw_segment_id: "",
    render_index: 0,
    render_timerange: null,
    responsive_layout: { enable: false, horizontal_pos_layout: 0, size_layout: 0, vertical_pos_layout: 0 },
    reverse: false,
    source: "segmentsourcenormal",
    source_timerange: { start: toUs(sourceStart), duration: toUs(sourceDuration ?? targetDuration) },
    speed: 1.0,
    state: 0,
    target_timerange: { start: toUs(targetStart), duration: toUs(targetDuration) },
    template_id: "",
    template_scene: "default",
    track_attribute: 0,
    track_render_index: 0,
    uniform_scale: { on: true, value: 1.0 },
    visible: true,
    volume: 1.0,
  };
}

// ── Main Bridge Function ─────────────────────────────────────────

export function generateCapCutDraft(input: DraftBridgeInput): DraftBridgeResult {
  const {
    projectName,
    clips,
    audio,
    textOverlays = [],
    captions = [],
    width = 1080,
    height = 1920,
    fps = 30,
  } = input;

  // Calculate total duration
  const allEnds = [
    ...clips.map(c => c.startOnTimeline + c.duration),
    ...audio.map(a => a.startOnTimeline + a.duration),
    ...textOverlays.map(t => t.startOnTimeline + t.duration),
    ...captions.map(c => c.startOnTimeline + c.duration),
  ];
  const totalDuration = Math.max(...allEnds, 0);

  // ── Build materials ──────────────────────────────────────────

  // Video/photo materials
  const videoMaterials = clips.map(clip => {
    const id = uuid();
    return {
      id,
      _clip: clip, // internal ref
      aigc_history_id: "",
      aigc_item_id: "",
      aigc_type: "none",
      audio_fade: null,
      beauty_body_preset_id: "",
      beauty_face_auto_preset: { name: "", preset_id: "", rate_map: {} },
      beauty_face_auto_preset_infos: [],
      beauty_face_preset_infos: [],
      category_id: "",
      category_name: "local",
      check_flag: 62978047,
      crop: {
        lower_left_x: 0.0, lower_left_y: 1.0,
        lower_right_x: 1.0, lower_right_y: 1.0,
        upper_left_x: 0.0, upper_left_y: 0.0,
        upper_right_x: 1.0, upper_right_y: 0.0,
      },
      crop_ratio: "free",
      crop_scale: 1.0,
      duration: toUs(clip.type === "photo" ? clip.duration : (clip.sourceDuration ?? clip.duration)),
      extra_type_option: 0,
      formula_id: "",
      freeze: null,
      has_audio: clip.type === "video",
      height: clip.height,
      intensifies_audio_path: "",
      is_ai_generate_content: false,
      is_unified_beauty_mode: false,
      live_photo_timestamp: -1,
      local_material_id: "",
      material_id: "",
      material_name: basename(clip.filePath),
      material_url: "",
      matting: { custom_matting_id: "", enable_matting_stroke: false, expansion: 0, feather: 0, flag: 0, has_use_quick_brush: false, has_use_quick_eraser: false, interactiveTime: [], path: "", strokes: [] },
      media_path: "",
      object_locked: null,
      origin_material_id: "",
      path: clip.filePath,
      picture_from: "none",
      picture_set_category_id: "",
      picture_set_category_name: "",
      request_id: "",
      reverse_intensity: 0,
      reverse_path: "",
      smart_motion: null,
      source_platform: 0,
      stable: { matrix_path: "", stable_level: 0, time_range: { start: 0, duration: 0 } },
      team_id: "",
      type: clip.type,
      video_algorithm: { ai_background_configs: [], ai_expression_driven: null, ai_motion_driven: null, aigc_generate: null, algorithms: [], deflicker: null, mouth_shape: null, noise_reduction: null, path: "", quality_enhance: null, time_range: null },
      width: clip.width,
    };
  });

  // Audio materials
  const audioMaterials = audio.map(a => {
    const id = uuid();
    return {
      id,
      _audio: a,
      ai_music_generate_scene: "",
      ai_music_type: 0,
      aigc_history_id: "",
      aigc_item_id: "",
      app_id: 0,
      category_id: "",
      category_name: "local",
      check_flag: 1,
      duration: toUs(a.duration),
      effect_id: "",
      formula_id: "",
      intensifies_path: "",
      is_ai_clone_tone: false,
      is_ugc: false,
      local_material_id: "",
      music_id: uuid(),
      name: a.name || basename(a.filePath),
      path: a.filePath,
      request_id: "",
      resource_id: "",
      search_id: "",
      similiar_music_info: { original_song_id: "", original_song_name: "" },
      source_from: "",
      source_platform: 0,
      team_id: "",
      text_id: "",
      tone_category_id: "",
      tone_category_name: "",
      tone_effect_id: "",
      tone_effect_name: "",
      tone_platform: "",
      tone_second_category_id: "",
      tone_speaker: "",
      tone_type: "",
      type: "extract_music",
      video_id: "",
      wave_points: [],
    };
  });

  // Text materials (overlays + captions)
  const textMaterials = [
    ...textOverlays.map(t => ({
      id: uuid(),
      _type: "overlay" as const,
      _text: t,
      add_type: 0,
      alignment: 1,
      background_alpha: t.bgAlpha ?? 1.0,
      background_color: "",
      background_fill: null,
      background_height: 0.14,
      background_horizontal_offset: 0.0,
      background_round_radius: 0.0,
      background_style: 0,
      background_vertical_offset: 0.0,
      background_width: 0.14,
      base_content: "",
      bold_width: 0.0,
      border_alpha: 1.0,
      border_color: "",
      border_width: 0.08,
      caption_template_info: { category_id: "", category_name: "", effect_id: "", is_new: false, path: "", request_id: "", resource_id: "", resource_name: "" },
      check_flag: 7,
      combo_info: { text_templates: [] },
      content: JSON.stringify({ styles: [{ fill: { content: { solid: { color: [1, 1, 1] } }, render_type: "solid" }, range: [0, t.text.length], size: t.fontSize ?? 30 }], text: t.text }),
      current_words: null,
      fixed_height: -1.0,
      fixed_width: -1.0,
      font_category_id: "",
      font_category_name: "",
      font_id: "",
      font_name: "",
      font_path: "",
      font_resource_id: "",
      font_size: t.fontSize ?? 30,
      font_source_platform: 0,
      font_team_id: "",
      font_title: "",
      font_url: "",
      fonts: [],
      force_apply_line_max_width: false,
      global_alpha: 1.0,
      group_id: "",
      has_shadow: true,
      // id already set above
      initial_scale: 1.0,
      inner_padding: -1.0,
      is_rich_text: false,
      italic_degree: 0,
      ktv_color: "",
      language: "",
      layer_weight: 1,
      letter_spacing: 0.0,
      line_feed: 1,
      line_max_width: 0.82,
      line_spacing: 0.02,
      multi_language_current: "none",
      name: "",
      original_size: [],
      preset_category: "",
      preset_category_id: "",
      preset_has_set_alignment: false,
      preset_id: "",
      preset_index: 0,
      preset_name: "",
      recognize_task_id: "",
      recognize_text: t.text,
      relevance_segment: [],
      shadow_alpha: 0.9,
      shadow_angle: -45.0,
      shadow_color: "",
      shadow_distance: 5.0,
      shadow_point: { x: 0.7071067811865476, y: -0.7071067811865476 },
      shadow_smoothing: 0.45,
      shape_clip_x: false,
      shape_clip_y: false,
      style_name: "",
      sub_type: 0,
      subtitle_keywords: null,
      text_alpha: 1.0,
      text_color: t.color ?? "#FFFFFF",
      text_curve: null,
      text_preset_resource_id: "",
      text_size: t.fontSize ?? 30,
      text_to_audio_ids: [],
      tts_auto_update: false,
      type: "text_overlay",
      typesetting: 0,
      underline: false,
      underline_offset: 0.22,
      underline_width: 0.05,
      use_effect_default_color: false,
      words: null,
    })),
    ...captions.map(c => ({
      id: uuid(),
      _type: "subtitle" as const,
      _text: c,
      add_type: 0,
      alignment: 1,
      background_alpha: 1.0,
      background_color: "",
      background_fill: null,
      background_height: 0.14,
      background_horizontal_offset: 0.0,
      background_round_radius: 0.0,
      background_style: 0,
      background_vertical_offset: 0.0,
      background_width: 0.14,
      base_content: "",
      bold_width: 0.0,
      border_alpha: 1.0,
      border_color: "",
      border_width: 0.08,
      caption_template_info: { category_id: "", category_name: "", effect_id: "", is_new: false, path: "", request_id: "", resource_id: "", resource_name: "" },
      check_flag: 7,
      combo_info: { text_templates: [] },
      content: JSON.stringify({ styles: [{ fill: { content: { solid: { color: [1, 1, 1] } }, render_type: "solid" }, range: [0, c.text.length], size: 30 }], text: c.text }),
      current_words: { end_time: toUs(c.startOnTimeline + c.duration), start_time: toUs(c.startOnTimeline), text: c.text },
      fixed_height: -1.0,
      fixed_width: -1.0,
      font_category_id: "",
      font_category_name: "",
      font_id: "",
      font_name: "",
      font_path: "",
      font_resource_id: "",
      font_size: 10.0,
      font_source_platform: 0,
      font_team_id: "",
      font_title: "",
      font_url: "",
      fonts: [],
      force_apply_line_max_width: false,
      global_alpha: 1.0,
      group_id: "",
      has_shadow: true,
      // id already set above
      initial_scale: 1.0,
      inner_padding: -1.0,
      is_rich_text: false,
      italic_degree: 0,
      ktv_color: "",
      language: "th",
      layer_weight: 1,
      letter_spacing: 0.0,
      line_feed: 1,
      line_max_width: 0.82,
      line_spacing: 0.02,
      multi_language_current: "none",
      name: "",
      original_size: [],
      preset_category: "",
      preset_category_id: "",
      preset_has_set_alignment: false,
      preset_id: "",
      preset_index: 0,
      preset_name: "",
      recognize_task_id: "",
      recognize_text: c.text,
      relevance_segment: [],
      shadow_alpha: 0.9,
      shadow_angle: -45.0,
      shadow_color: "",
      shadow_distance: 5.0,
      shadow_point: { x: 0.7071067811865476, y: -0.7071067811865476 },
      shadow_smoothing: 0.45,
      shape_clip_x: false,
      shape_clip_y: false,
      style_name: "",
      sub_type: 5,
      subtitle_keywords: null,
      text_alpha: 1.0,
      text_color: "#FFFFFF",
      text_curve: null,
      text_preset_resource_id: "",
      text_size: 30,
      text_to_audio_ids: [],
      tts_auto_update: false,
      type: "subtitle",
      typesetting: 0,
      underline: false,
      underline_offset: 0.22,
      underline_width: 0.05,
      use_effect_default_color: true,
      words: { end_time: toUs(c.startOnTimeline + c.duration), start_time: toUs(c.startOnTimeline), text: c.text },
    })),
  ];

  // Set IDs
  textMaterials.forEach(t => { if (!t.id) t.id = uuid(); });

  // Canvas + speeds + other required materials
  const canvasMaterials = videoMaterials.map(() => ({
    album_image: "",
    blur: 0.0,
    color: "",
    id: uuid(),
    image: "",
    image_id: "",
    image_name: "",
    source_platform: 0,
    team_id: "",
    type: "canvas_color",
  }));

  const speedMaterials = [...videoMaterials, ...audioMaterials].map(() => ({
    curve_speed: null,
    id: uuid(),
    mode: 0,
    speed: 1.0,
    type: "speed",
  }));

  // ── Build tracks ─────────────────────────────────────────────

  // Video track
  const videoSegments = videoMaterials.map(vm => {
    const clip = vm._clip;
    return makeSegment(vm.id, clip.startOnTimeline, clip.duration, clip.sourceStart ?? 0, clip.sourceDuration);
  });

  // Audio track
  const audioSegments = audioMaterials.map(am => {
    const a = am._audio;
    const seg = makeSegment(am.id, a.startOnTimeline, a.duration);
    (seg as Record<string, unknown>).volume = a.volume ?? 1.0;
    return seg;
  });

  // Text overlay track
  const overlaySegments = textMaterials
    .filter(t => t._type === "overlay")
    .map(t => makeSegment(t.id, t._text.startOnTimeline, t._text.duration));

  // Caption track
  const captionSegments = textMaterials
    .filter(t => t._type === "subtitle")
    .map(t => makeSegment(t.id, t._text.startOnTimeline, t._text.duration));

  const tracks: Array<Record<string, unknown>> = [];

  if (videoSegments.length > 0) {
    tracks.push({
      attribute: 0,
      flag: 0,
      id: uuid(),
      is_default_name: true,
      segments: videoSegments,
      type: "video",
    });
  }

  if (overlaySegments.length > 0) {
    tracks.push({
      attribute: 0,
      flag: 0,
      id: uuid(),
      is_default_name: true,
      segments: overlaySegments,
      type: "text",
    });
  }

  if (captionSegments.length > 0) {
    tracks.push({
      attribute: 0,
      flag: 0,
      id: uuid(),
      is_default_name: true,
      segments: captionSegments,
      type: "text",
    });
  }

  if (audioSegments.length > 0) {
    tracks.push({
      attribute: 0,
      flag: 0,
      id: uuid(),
      is_default_name: true,
      segments: audioSegments,
      type: "audio",
    });
  }

  // ── Build draft_info.json ────────────────────────────────────

  // Clean internal refs from materials before saving
  const cleanVideoMats = videoMaterials.map(v => { const { _clip, ...rest } = v; return rest; });
  const cleanAudioMats = audioMaterials.map(a => { const { _audio, ...rest } = a; return rest; });
  const cleanTextMats = textMaterials.map(t => { const { _type, _text, ...rest } = t; return rest; });

  const draftInfo: Record<string, unknown> = {
    canvas_config: { background: null, height, ratio: "9:16", width },
    color_space: 0,
    config: { adjust_max_index: 1, attachment_info: [], combination_max_index: 0, export_range: null, extract_audio_last_index: 0, lyrics_recognition_id: "", lyrics_sync: false, lyrics_taskinfo: [], maintrack_adsorb: true, material_save_mode: 0, multi_language_current: "none", multi_language_list: [], multi_language_main: "none", original_sound_last_index: 0, record_audio_last_index: 0, sticker_max_index: 0, subtitle_keywords_config: null, subtitle_recognition_id: "", subtitle_sync: true, subtitle_taskinfo: [], system_font_list: [], video_mute: false, zoom_info_params: null },
    cover: null,
    create_time: 0,
    duration: toUs(totalDuration),
    extra_info: { subtitle_fragment_info_list: [], text_to_video: null, track_info: [] },
    fps: fps * 1.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: uuid(),
    is_drop_frame_timecode: false,
    keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    last_modified_platform: { app_id: 359289, app_source: "cc", app_version: "8.5.0", device_id: "whispercut", hard_disk_id: "", mac_address: "", os: "mac", os_version: "15.0" },
    lyrics_effects: [],
    materials: {
      ai_translates: [],
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audio_track_indexes: [],
      audios: cleanAudioMats,
      beats: audioMaterials.map(() => ({ ai_beats: { beats_path: "", beats_url: "", melody_path: "", melody_percents: [], melody_url: "" }, enable_ai_beats: false, gear: 404, gear_count: 0, id: uuid(), mode: 404, type: "beats", user_beats: [], user_delete_ai_beats: null })),
      canvases: canvasMaterials,
      chromas: [],
      color_curves: [],
      common_mask: [],
      digital_human_model_dressing: [],
      digital_humans: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      images: [],
      log_color_wheels: [],
      loudnesses: [],
      manual_beautys: [],
      manual_deformations: [],
      material_animations: [],
      material_colors: [],
      multi_language_refs: [],
      placeholder_infos: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      smart_relights: [],
      sound_channel_mappings: [...videoMaterials, ...audioMaterials].map(() => ({ audio_channel_mapping: 0, id: uuid(), is_config_open: false, type: "none" })),
      speeds: speedMaterials,
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      texts: cleanTextMats,
      time_marks: [],
      transitions: [],
      video_effects: [],
      video_trackings: [],
      videos: cleanVideoMats,
      vocal_beautifys: [],
      vocal_separations: [...videoMaterials, ...audioMaterials].map(() => ({ choice: 0, enter_from: "", final_algorithm: "", id: uuid(), production_path: "", removed_sounds: [], time_range: { start: 0, duration: 0 }, type: "vocal_separation" })),
    },
    mutable_config: null,
    name: "",
    new_version: "167.0.0",
    path: "",
    platform: { app_id: 359289, app_source: "cc", app_version: "8.5.0", device_id: "whispercut", hard_disk_id: "", mac_address: "", os: "mac", os_version: "15.0" },
    relationships: [],
    render_index_track_mode_on: true,
    retouch_cover: null,
    source: "default",
    static_cover_image_path: "",
    time_marks: null,
    tracks,
    uneven_animation_template_info: { composition: null, content: null, order: null, sub_template_info_list: null },
    update_time: 0,
    version: 360000,
  };

  // ── Write to CapCut project directory ─────────────────────────

  const capCutProjectsDir = join(homedir(), "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft");
  const safeName = projectName.replace(/[^a-zA-Z0-9\u0E00-\u0E7F_-]/g, "_").slice(0, 40);
  const projectDir = join(capCutProjectsDir, safeName);

  mkdirSync(projectDir, { recursive: true });

  // Write draft_info.json
  const draftInfoPath = join(projectDir, "draft_info.json");
  writeFileSync(draftInfoPath, JSON.stringify(draftInfo, null, 2));

  // Write draft_meta_info.json
  const metaInfo = {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    draft_fold_path: projectDir,
    draft_id: uuid(),
    draft_is_invisible: false,
    draft_materials: clips.map(c => ({
      type: c.type === "video" ? 1 : 0,
      value: [{
        create_time: Math.floor(Date.now() / 1000),
        duration: toUs(c.duration),
        file_Path: c.filePath,
        height: c.height,
        id: uuid(),
        import_time: Math.floor(Date.now() / 1000),
        import_time_ms: Date.now() * 1000,
        item_source: 1,
        md5: "",
        metetype: c.type === "video" ? "video" : "photo",
        roughcut_time_range: { duration: toUs(c.duration), start: 0 },
        sub_time_range: { duration: -1, start: -1 },
        type: 0,
        width: c.width,
      }],
    })),
    draft_name: projectName,
    draft_new_version: "139.0.0",
    draft_removable_storage_device: "",
    draft_root_path: "",
    draft_timeline_materials_size_: 0,
    tm_draft_cloud_completed: "",
    tm_draft_cloud_modified: 0,
    tm_draft_create: Math.floor(Date.now() / 1000),
    tm_draft_modified: Math.floor(Date.now() / 1000),
    tm_duration: toUs(totalDuration),
  };

  const metaInfoPath = join(projectDir, "draft_meta_info.json");
  writeFileSync(metaInfoPath, JSON.stringify(metaInfo, null, 2));

  // Create required subdirectories
  for (const dir of ["Resources", "Resources/audioAlg", "Resources/videoAlg", "adjust_mask", "common_attachment", "matting", "qr_upload", "smart_crop"]) {
    mkdirSync(join(projectDir, dir), { recursive: true });
  }

  console.error(`[capcut-bridge] Draft created: ${projectDir}`);
  console.error(`[capcut-bridge] ${clips.length} clips, ${audio.length} audio, ${textOverlays.length} overlays, ${captions.length} captions`);
  console.error(`[capcut-bridge] Open CapCut Desktop → project "${projectName}" should appear`);

  return {
    projectPath: projectDir,
    draftInfoPath,
    metaInfoPath,
    success: true,
  };
}
