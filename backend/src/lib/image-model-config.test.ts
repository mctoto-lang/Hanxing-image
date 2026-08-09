import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_IMAGE_API_FORMAT,
  DEFAULT_REFERENCE_IMAGE_FIELD,
  assertSupportedImageApiFormat,
  buildGrsRequestBody,
  buildImageLogRequestParams,
  buildImageRequestSummary,
  buildImageResponseSummary,
  buildJimengRequestBody,
  isLegacyImageApiFormat,
  getLegacyImageModelMigration,
  resolveGrsGenerateEndpoint,
  resolveGrsResultEndpoint,
  validateQueuedGeneration,
  validateGenerationCapabilities,
  validateImageModelConfig,
} from './image-model-config'

describe('图片模型配置校验', () => {
  it('仅接受 GRS 和即梦接口格式', () => {
    assert.doesNotThrow(() => validateImageModelConfig({ api_format: 'jimeng', extra_config: '{}' }))
    assert.throws(() => validateImageModelConfig({ api_format: 'openai', extra_config: '{}' }), /仅支持 grs 和 jimeng/)
  })

  it('GRS 必须明确选择 GPT 或 Gemini 模型族', () => {
    assert.throws(() => validateImageModelConfig({ api_format: 'grs', extra_config: '{}' }), /GRS 模型族/)
    assert.doesNotThrow(() => validateImageModelConfig({
      api_format: 'grs',
      extra_config: JSON.stringify({ grs_model_family: 'gpt', reply_type: 'json' }),
    }))
    assert.doesNotThrow(() => validateImageModelConfig({
      api_format: 'grs',
      extra_config: { grs_model_family: 'gemini', image_size_grs: '2K' },
    }))
  })

  it('拒绝不属于所选格式的配置字段和非法枚举', () => {
    assert.throws(() => validateImageModelConfig({
      api_format: 'jimeng',
      extra_config: { grs_model_family: 'gpt' },
    }), /不支持配置字段/)
    assert.throws(() => validateImageModelConfig({
      api_format: 'grs',
      extra_config: { grs_model_family: 'gemini', image_size_grs: '8K' },
    }), /image_size_grs/)
    assert.throws(() => validateImageModelConfig({
      api_format: 'jimeng',
      extra_config: { jimeng_resolution: '8k', jimeng_n: 5 },
    }), /jimeng_resolution/)
  })
})

describe('旧图片接口格式迁移', () => {
  it('将 GRS 和即梦之外的格式识别为旧格式', () => {
    assert.equal(isLegacyImageApiFormat('grs'), false)
    assert.equal(isLegacyImageApiFormat('jimeng'), false)
    assert.equal(isLegacyImageApiFormat('openai'), true)
    assert.equal(isLegacyImageApiFormat('gemini'), true)
    assert.equal(isLegacyImageApiFormat('midjourney'), true)
  })

  it('迁移为可校验的 GRS 配置并同时禁用所有展示入口', () => {
    assert.deepEqual(getLegacyImageModelMigration('openai'), {
      api_format: 'grs',
      extra_config: JSON.stringify({ grs_model_family: 'gpt' }),
      is_active: 0,
      visible_in_generate: 0,
      visible_in_canvas: 0,
      visible_in_workspace: 0,
      visible_in_product: 0,
    })
    assert.equal(getLegacyImageModelMigration('jimeng'), null)
  })
})

describe('GRS 请求字段和尺寸构造', () => {
  it('参考图字段默认使用 images 且支持自定义', () => {
    const baseInput = {
      model: 'gpt-image-2',
      prompt: '海边日落',
      imageSize: '1536x1024',
      extraConfig: { grs_model_family: 'gpt' as const },
      referenceImages: ['https://example.com/a.png'],
    }
    assert.deepEqual(buildGrsRequestBody(baseInput).images, ['https://example.com/a.png'])
    assert.deepEqual(buildGrsRequestBody({ ...baseInput, referenceImageField: 'base_url' }).base_url, ['https://example.com/a.png'])
    assert.equal(buildGrsRequestBody({ ...baseInput, referenceImageField: 'base_url' }).images, undefined)
  })

  it('GPT 模型族通过 aspectRatio 字段传递像素尺寸', () => {
    assert.deepEqual(buildGrsRequestBody({
      model: 'gpt-image-2',
      prompt: '海边日落',
      imageSize: '1536x1024',
      extraConfig: { grs_model_family: 'gpt', reply_type: 'json', image_size_grs: '4K' },
      referenceImages: ['https://example.com/a.png'],
    }), {
      model: 'gpt-image-2',
      prompt: '海边日落',
      aspectRatio: '1536x1024',
      replyType: 'json',
      images: ['https://example.com/a.png'],
    })
  })

  it('GPT 模型族 2:3 尺寸传递原始像素值而非比例', () => {
    assert.equal(
      buildGrsRequestBody({
        model: 'gpt-image-2',
        prompt: '海边日落',
        imageSize: '1024x1536',
        extraConfig: { grs_model_family: 'gpt' },
        referenceImages: [],
      }).aspectRatio,
      '1024x1536'
    )
  })

  it('Gemini 模型族使用约分比例并发送分辨率', () => {
    assert.deepEqual(buildGrsRequestBody({
      model: 'nano-banana',
      prompt: '海边日落',
      imageSize: '2048x1152',
      extraConfig: { grs_model_family: 'gemini', reply_type: 'async', image_size_grs: '2K' },
      referenceImages: [],
    }), {
      model: 'nano-banana',
      prompt: '海边日落',
      aspectRatio: '16:9',
      replyType: 'async',
      imageSize: '2K',
    })
  })

  it('Gemini 模型族遇到非 WxH 格式尺寸时抛出错误而非静默回退 1:1', () => {
    assert.throws(() => buildGrsRequestBody({
      model: 'nano-banana',
      prompt: '海边日落',
      imageSize: '2:3',
      extraConfig: { grs_model_family: 'gemini' },
      referenceImages: [],
    }), /无法将尺寸/)
  })
})

describe('即梦请求字段构造', () => {
  it('参考图使用模型配置的自定义字段', () => {
    const body = buildJimengRequestBody({
      model: 'jimeng-4.0',
      prompt: '海边日落',
      ratio: '16:9',
      resolution: '2k',
      count: 2,
      referenceImages: ['https://example.com/a.png'],
      referenceImageField: 'image_urls',
    })
    assert.deepEqual(body.image_urls, ['https://example.com/a.png'])
    assert.equal(body.images, undefined)
  })
})

describe('队列执行前重验', () => {
  it('使用当前模型配置同时重验接口配置、参考图和尺寸', () => {
    assert.throws(() => validateQueuedGeneration({
      api_format: 'openai',
      extra_config: '{}',
      supports_reference_image: 1,
      max_reference_images: 1,
      supported_sizes: { ratios: [{ width: 1024, height: 1024 }] },
    }, ['a.png'], '1024x1024'), /仅支持 grs 和 jimeng/)
    assert.throws(() => validateQueuedGeneration({
      api_format: 'jimeng',
      extra_config: '{}',
      supports_reference_image: 0,
      max_reference_images: 1,
      supported_sizes: { ratios: [{ width: 1024, height: 1024 }] },
    }, ['a.png'], '1024x1024'), /不支持参考图/)
  })
})

describe('持久日志摘要', () => {
  it('为通用调用日志和工作台日志构造同一份无 URL 请求参数', () => {
    const params = buildImageLogRequestParams({
      source: 'workspace',
      sourceLabel: '批量单图',
      taskType: 'workspace_single',
      model: 'nano-banana',
      prompt: '海边日落',
      format: 'grs',
      referenceImages: ['https://secret.example.com/reference.png'],
      referenceImageField: 'base_url',
      modelFamily: 'gemini',
      imageSize: '2048x1152',
    })

    assert.deepEqual(params, {
      source: 'workspace',
      source_label: '批量单图',
      task_type: 'workspace_single',
      model: 'nano-banana',
      prompt: '海边日落',
      size: '2048x1152',
      format: 'grs',
      has_reference_images: true,
      reference_image_count: 1,
      reference_image_field: 'base_url',
      model_family: 'gemini',
      image_size: '2048x1152',
    })
    assert.equal(JSON.stringify(params).includes('https://'), false)
  })

  it('请求摘要记录参考图元数据但不持久化 URL', () => {
    const summary = buildImageRequestSummary({
      referenceImages: ['https://secret.example.com/a.png', 'https://secret.example.com/b.png'],
      referenceImageField: 'base_url',
      modelFamily: 'gemini',
      imageSize: '2048x1152',
    })

    assert.deepEqual(summary, {
      has_reference_images: true,
      reference_image_count: 2,
      reference_image_field: 'base_url',
      model_family: 'gemini',
      image_size: '2048x1152',
    })
    assert.equal(JSON.stringify(summary).includes('https://'), false)
  })

  it('无参考图时保留完整的零值请求摘要', () => {
    assert.deepEqual(buildImageRequestSummary({
      referenceImages: [],
      referenceImageField: 'images',
      modelFamily: 'gpt',
      imageSize: '1024x1024',
    }), {
      has_reference_images: false,
      reference_image_count: 0,
      reference_image_field: 'images',
      model_family: 'gpt',
      image_size: '1024x1024',
    })
  })

  it('仅持久化图片数量和有限预览，不保存完整响应列表', () => {
    const urls = Array.from({ length: 15 }, (_, index) => `https://example.com/${index}.png`)
    assert.deepEqual(buildImageResponseSummary(urls), {
      imageCount: 15,
      imageUrls: urls.slice(0, 10),
    })
  })
})

describe('图片模型默认值和队列分派', () => {
  it('模型默认使用 GRS 和 images 参考图字段', () => {
    assert.equal(DEFAULT_IMAGE_API_FORMAT, 'grs')
    assert.equal(DEFAULT_REFERENCE_IMAGE_FIELD, 'images')
  })

  it('队列仅接受 GRS 和即梦并拒绝未知格式', () => {
    assert.equal(assertSupportedImageApiFormat('grs'), 'grs')
    assert.equal(assertSupportedImageApiFormat('jimeng'), 'jimeng')
    assert.throws(() => assertSupportedImageApiFormat('openai'), /不支持的图片接口格式：openai/)
    assert.throws(() => assertSupportedImageApiFormat(undefined), /不支持的图片接口格式：undefined/)
  })
})

describe('统一生成能力校验', () => {
  const model = {
    supports_reference_image: 1,
    max_reference_images: 2,
    supported_sizes: { ratios: [{ ratio: '1:1', width: 1024, height: 1024 }] },
  }

  it('接受模型支持的参考图和尺寸', () => {
    assert.deepEqual(validateGenerationCapabilities(model, [' a.png ', 'b.png'], '1024x1024'), ['a.png', 'b.png'])
  })

  it('拒绝模型不支持或超量的参考图', () => {
    assert.throws(() => validateGenerationCapabilities({ ...model, supports_reference_image: 0 }, ['a.png'], '1024x1024'), /不支持参考图/)
    assert.throws(() => validateGenerationCapabilities(model, ['a.png', 'b.png', 'c.png'], '1024x1024'), /最多支持 2 张参考图/)
  })

  it('拒绝模型未配置的尺寸并兼容 JSON 字符串配置', () => {
    assert.throws(() => validateGenerationCapabilities(model, [], '1536x1024'), /不支持尺寸 1536x1024/)
    assert.doesNotThrow(() => validateGenerationCapabilities({ ...model, supported_sizes: JSON.stringify(model.supported_sizes) }, [], '1024x1024'))
  })

  it('GPT 模型族按比例匹配，兼容等比例不同像素值', () => {
    const gptModel = {
      ...model,
      api_format: 'grs',
      extra_config: JSON.stringify({ grs_model_family: 'gpt' }),
      supported_sizes: { ratios: [{ ratio: '1:1', width: 1024, height: 1024 }] },
    }
    // 提交 2048x2048（同为 1:1）应通过
    assert.doesNotThrow(() => validateGenerationCapabilities(gptModel, [], '2048x2048'))
    // 精确匹配仍通过
    assert.doesNotThrow(() => validateGenerationCapabilities(gptModel, [], '1024x1024'))
    // 不同比例应拒绝
    assert.throws(() => validateGenerationCapabilities(gptModel, [], '1536x1024'), /不支持尺寸 1536x1024/)
  })

  it('非 GPT 模型族仍按精确尺寸匹配', () => {
    const geminiModel = {
      ...model,
      api_format: 'grs',
      extra_config: JSON.stringify({ grs_model_family: 'gemini' }),
      supported_sizes: { ratios: [{ ratio: '1:1', width: 1024, height: 1024 }] },
    }
    assert.throws(() => validateGenerationCapabilities(geminiModel, [], '2048x2048'), /不支持尺寸 2048x2048/)
  })
})

describe('GRS 端点规范化', () => {
  it('将裸域名补全为 /v1/api/generate', () => {
    assert.equal(resolveGrsGenerateEndpoint('https://grsai.dakka.com.cn'), 'https://grsai.dakka.com.cn/v1/api/generate')
  })

  it('将 /v1 后缀补全为 /v1/api/generate', () => {
    assert.equal(resolveGrsGenerateEndpoint('https://grsai.dakka.com.cn/v1'), 'https://grsai.dakka.com.cn/v1/api/generate')
  })

  it('将 /v1/api 后缀补全为 /v1/api/generate', () => {
    assert.equal(resolveGrsGenerateEndpoint('https://grsai.dakka.com.cn/v1/api'), 'https://grsai.dakka.com.cn/v1/api/generate')
  })

  it('保留已是 /v1/api/generate 的端点', () => {
    assert.equal(resolveGrsGenerateEndpoint('https://grsai.dakka.com.cn/v1/api/generate'), 'https://grsai.dakka.com.cn/v1/api/generate')
  })

  it('将 OpenAI 风格端点 /v1/images/generations 转换为 GRS 生成端点', () => {
    assert.equal(resolveGrsGenerateEndpoint('https://grsai.dakka.com.cn/v1/images/generations'), 'https://grsai.dakka.com.cn/v1/api/generate')
  })

  it('去除尾部斜杠后再规范化', () => {
    assert.equal(resolveGrsGenerateEndpoint('https://grsai.dakka.com.cn/v1/'), 'https://grsai.dakka.com.cn/v1/api/generate')
  })

  it('轮询端点统一解析为 /v1/api/result', () => {
    assert.equal(resolveGrsResultEndpoint('https://grsai.dakka.com.cn'), 'https://grsai.dakka.com.cn/v1/api/result')
    assert.equal(resolveGrsResultEndpoint('https://grsai.dakka.com.cn/v1/api/generate'), 'https://grsai.dakka.com.cn/v1/api/result')
    assert.equal(resolveGrsResultEndpoint('https://grsai.dakka.com.cn/v1/images/generations'), 'https://grsai.dakka.com.cn/v1/api/result')
  })
})
