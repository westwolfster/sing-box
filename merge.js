/**
 * 纯高级脚本流：动态拉取指定机场订阅 + 精准国别分类 + 完美匹配自定义 outbounds 分组
 * 适用场景：Sub-store 文件管理 (Files) 挂载
 * 接收参数示例：name=ikuuu_singbox
 */
async function operator() {
  // 1. 获取传入的参数（订阅名称）
  const { name } = $arguments;
  if (!name) {
    console.log("[AI 国别分组] 错误：未在参数中检测到 name，请配置为 name=你的订阅名");
    return;
  }

  // 2. 读取当前文件管理中的基础模板 JSON (即 $files[0])
  let config = JSON.parse($files[0]);

  // 3. 仿照 merge_all.js 标准规范，异步拉取指定的订阅节点
  let proxies = [];
  try {
    proxies = await produceArtifact({
      name: name,
      type: "subscription", // 如果使用的是组合订阅/合集，可将此改为 "collection"
      platform: "sing-box",
      produceType: "internal",
    });
    console.log(`[AI 国别分组] 成功拉取到订阅 [${name}] 的节点共计: ${proxies.length} 个`);
  } catch (e) {
    console.log(`[AI 国别分组] 严重错误：拉取订阅 [${name}] 节点失败: ` + e.message);
    return; // 失败则终止，防止破坏原始模板
  }

  // 4. 去重：防止模板中本身就写了重复的实体节点标签
  const existingTags = config.outbounds.map(o => o.tag);
  proxies = proxies.filter(p => !existingTags.includes(p.tag));

  // 5. 将洗干净后的所有实体节点追加到最外层的 outbounds 数组中，供策略组调用
  config.outbounds.push(...proxies);

  // 6. 定义国别关键字匹配规则（忽略大小写）
  const REGEX_HK = /(香港|HK|Hong Kong|HongKong|Hkg)/i;
  const REGEX_SG = /(新加坡|SG|Singapore|Sgp)/i;
  const REGEX_JP = /(日本|JP|Japan|东京|大阪|Jpn)/i;
  const REGEX_KR = /(韩国|KR|Korea|首尔|Kor)/i;
  const REGEX_US = /(美国|US|United States|America|Usa)/i;

  const hkNodes = [];
  const sgNodes = [];
  const jpNodes = [];
  const krNodes = [];
  const usNodes = [];
  const otherNodes = [];
  const allNodeTags = [];

  // 7. 遍历获取提取出的节点，进行国别归类
  proxies.forEach(proxy => {
    if (!proxy || !proxy.tag) return;
    const tag = proxy.tag;
    allNodeTags.push(tag);

    if (REGEX_HK.test(tag)) {
      hkNodes.push(tag);
    } else if (REGEX_SG.test(tag)) {
      sgNodes.push(tag);
    } else if (REGEX_JP.test(tag)) {
      jpNodes.push(tag);
    } else if (REGEX_KR.test(tag)) {
      krNodes.push(tag);
    } else if (REGEX_US.test(tag)) {
      usNodes.push(tag);
    } else {
      otherNodes.push(tag);
    }
  });

  // 8. 精准遍历模板的分组，将分好类的节点塞入对应的 outbounds 中
  config.outbounds.forEach(group => {
    if (!Array.isArray(group.outbounds)) return;

    // 全局自动测速组：塞入所有节点
    if (group.tag === "Auto") {
      group.outbounds.push(...allNodeTags);
    }
    // AI 专用自动测速组：只合并塞入新、日、韩、美（绝对没有香港节点）
    else if (group.tag === "AI-Auto") {
      const aiNodes = [...sgNodes, ...jpNodes, ...krNodes, ...usNodes];
      group.outbounds.push(...aiNodes);
    }
    // 国别具体策略组映射
    else if (group.tag === "香港 (HK)") {
      group.outbounds.push(...hkNodes);
    } 
    else if (group.tag === "新加坡 (SG)") {
      group.outbounds.push(...sgNodes);
    } 
    else if (group.tag === "日本 (JP)") {
      group.outbounds.push(...jpNodes);
    } 
    else if (group.tag === "韩国 (KR)") {
      group.outbounds.push(...krNodes);
    } 
    else if (group.tag === "美国 (US)") {
      group.outbounds.push(...usNodes);
    } 
    else if (group.tag === "其它地区") {
      group.outbounds.push(...otherNodes);
    }
  });

  // 9. 容错处理：如果某个国别组机场没有提供节点，放个 "Direct-Out" 兜底防止 sing-box 启动因空组报错
  config.outbounds.forEach(group => {
    if (Array.isArray(group.outbounds) && group.outbounds.length === 0 && group.tag !== "Auto" && group.tag !== "AI-Auto") {
      group.outbounds.push("Direct-Out");
    }
    // 分组内顺便做一次去重
    if (Array.isArray(group.outbounds)) {
      group.outbounds = [...new Set(group.outbounds)];
    }
  });

  console.log("[AI 国别分组] 自定义国别分组及 AI-Auto 链路注入完美成功！");

  // 10. 将组装好的最终完整配置渲染输出
  $content = JSON.stringify(config, null, 2);
}