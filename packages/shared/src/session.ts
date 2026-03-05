import { z } from 'zod';

export const ChoiceSchema = z.object({
    id: z.string(),
    text: z.string(),
    next_scene_id: z.string(),
    correctness: z.boolean().optional(),
    feedback: z.string(),
});

export const HotspotSchema = z.object({
    id: z.string(),
    label: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    dialogue: z.string(),
    expand_text: z.string(),
    sound_cue: z.string().optional(),
});

export const QuizSchema = z.object({
    question: z.string(),
    options: z.array(z.string()),
    correct_index: z.number(),
    explanation: z.string(),
});

export const SceneSchema = z.object({
    id: z.string(),
    narration: z.string(),
    image_prompt: z.string().optional(),
    choices: z.array(ChoiceSchema),
    hotspots: z.array(HotspotSchema),
    quiz: QuizSchema.optional(),
});

export const SessionStateSchema = z.object({
    current_scene_index: z.number(),
    score: z.number(),
    decisions: z.array(z.string()),
});

export const SessionSchema = z.object({
    id: z.string(),
    created_at: z.string().datetime(),
    topic: z.string(),
    settings: z.record(z.any()).optional(),
    scenes: z.array(SceneSchema),
    state: SessionStateSchema,
});

export type Choice = z.infer<typeof ChoiceSchema>;
export type Hotspot = z.infer<typeof HotspotSchema>;
export type Quiz = z.infer<typeof QuizSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type Session = z.infer<typeof SessionSchema>;
