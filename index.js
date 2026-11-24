import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'my-app';

// 等宿主的工具注册服务就绪后再运行
export const inject = ['tools'];

const VERSION = '0.1.0';

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'my_app_ping',
    description: '确认 my-app 插件已加载：返回插件名、版本和当前 DSH profile。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          version: { type: 'string', required: true },
          profile: { type: 'string', required: true, description: '当前 DSH profile 名；空表示未用 profile 启动。' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [
        { type: 'text', text: `${value.name} v${value.version} 已加载${value.profile ? `（profile: ${value.profile}）` : ''}。` },
      ],
    },
    execute: async () => ({
      name: '@local/my-app',
      version: VERSION,
      profile: process.env.DSH_PROFILE ?? '',
    }),
  }));
}
