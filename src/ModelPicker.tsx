import React from 'react';
import { GEMINI_MODELS, type GeminiModelId } from './services/modelSelection';

interface Props {
  value: GeminiModelId;
  onChange: (model: GeminiModelId) => void;
}

export default function ModelPicker({ value, onChange }: Props) {
  return (
    <div className="mb-6">
      <label htmlFor="gemini-model" className="block text-sm font-medium text-gray-700 mb-1">
        Gemini 模型
      </label>
      <select
        id="gemini-model"
        value={value}
        onChange={event => {
          const option = GEMINI_MODELS.find(model => model.id === event.target.value);
          if (option) onChange(option.id);
        }}
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {GEMINI_MODELS.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
      </select>
      <p className="mt-1 text-xs text-gray-500">
        各模型的剩余额度取决于你的 API Key；切换不保证有额度。Flash Lite 生成的日语请核对读音、译文和例句；启用付费方案时调用可能计费。
      </p>
    </div>
  );
}
