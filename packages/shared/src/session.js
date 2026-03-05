"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionSchema = exports.SessionStateSchema = exports.SceneSchema = exports.QuizSchema = exports.HotspotSchema = exports.ChoiceSchema = void 0;
var zod_1 = require("zod");
exports.ChoiceSchema = zod_1.z.object({
    id: zod_1.z.string(),
    text: zod_1.z.string(),
    next_scene_id: zod_1.z.string(),
    correctness: zod_1.z.boolean().optional(),
    feedback: zod_1.z.string(),
});
exports.HotspotSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    w: zod_1.z.number(),
    h: zod_1.z.number(),
    dialogue: zod_1.z.string(),
    expand_text: zod_1.z.string(),
    sound_cue: zod_1.z.string().optional(),
});
exports.QuizSchema = zod_1.z.object({
    question: zod_1.z.string(),
    options: zod_1.z.array(zod_1.z.string()),
    correct_index: zod_1.z.number(),
    explanation: zod_1.z.string(),
});
exports.SceneSchema = zod_1.z.object({
    id: zod_1.z.string(),
    narration: zod_1.z.string(),
    image_prompt: zod_1.z.string().optional(),
    choices: zod_1.z.array(exports.ChoiceSchema),
    hotspots: zod_1.z.array(exports.HotspotSchema),
    quiz: exports.QuizSchema.optional(),
});
exports.SessionStateSchema = zod_1.z.object({
    current_scene_index: zod_1.z.number(),
    score: zod_1.z.number(),
    decisions: zod_1.z.array(zod_1.z.string()),
});
exports.SessionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    created_at: zod_1.z.string().datetime(),
    topic: zod_1.z.string(),
    settings: zod_1.z.record(zod_1.z.any()).optional(),
    scenes: zod_1.z.array(exports.SceneSchema),
    state: exports.SessionStateSchema,
});
