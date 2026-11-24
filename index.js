// my-app —— DSH 插件入口。
// 故意不 import 任何包：这样无论从本机目录还是从 npm 装，都能直接加载。
// 工具的参数与输出用标准 JSON Schema 描述。

export const name = 'my-app';

// 等宿主的工具注册服务（ctx.tools）就绪后再运行
export const inject = ['tools'];

const VERSION = '0.1.0';

const parameters = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '包名。' },
    version: { type: 'string', description: '插件版本。' },
    profile: { type: 'string', description: '当前 DSH profile 名；空字符串表示未用 profile 启动。' },
  },
  required: ['name', 'version', 'profile'],
  additionalProperties: false,
};

export function apply(ctx) {
  ctx.tools.register({
    name: 'my_app_ping',
    description: '确认 my-app 插件已加载：返回插件名、版本和当前 DSH profile。',
    parameters,
    output: {
      schema: outputSchema,
      render: (_args, value) => [
        {
          type: 'text',
          text: `${value.name} v${value.version} 已加载${value.profile ? `（profile: ${value.profile}）` : ''}。`,
        },
      ],
    },
    execute: async () => ({
      name: '@local/my-app',
      version: VERSION,
      profile: process.env.DSH_PROFILE ?? '',
    }),
  });
}
