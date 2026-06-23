const { name } = $arguments;

if (!name) {
  console.log("[AI国别分组] 错误：未在参数中检测到 name，请在 Argument 栏配置为 name=你的订阅名");
} else {
  // 1. 读取模板 (完全对齐 merge_all.js 规范)
  let config = JSON.parse($files[0]);

  try {
    // 2. 异步拉取指定的订阅节点
    let proxies = await produceArtifact({
      name: name,
      type: "subscription",
      platform: "sing-box",
      produceType: "internal",
    });
    console.log(`[AI国别分组] 成功拉取到订阅 [${name}] 的节点共计: ${proxies.length} 个`);

    if (proxies && proxies.length > 0) {
      // 3. 去重已有的节点 tag
      const existingTags = config.outbounds.map(o => o.tag);
      proxies = proxies.filter(p => !existingTags.includes(p.tag));

      // 4. 定义国别关键字匹配规则（忽略大小写）
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

      // 5. 遍历并分类所有拉取到的节点标签
      proxies.forEach(p => {
        if (!p || !p.tag) return;
        allNodeTags.push(p.tag);

        if (REGEX_HK.test(p.tag)) hkNodes.push(p.tag);
        else if (REGEX_SG.test(p.tag)) sgNodes.push(p.tag);
        else if (REGEX_JP.test(p.tag)) jpNodes.push(p.tag);
        else if (REGEX_KR.test(p.tag)) krNodes.push(p.tag);
        else if (REGEX_US.test(p.tag)) usNodes.push(p.tag);
        else otherNodes.push(p.tag);
      });

      // 6. 遍历模板的分组，将分好类的 tag 追加到对应的 outbounds 中
      config.outbounds.forEach(group => {
        if (!Array.isArray(group.outbounds) || group.tag === "Direct-Out") return;

        // 全局自动测速组：塞入所有节点
        if (group.tag === "Auto") {
          group.outbounds.push(...allNodeTags);
        }
        // AI 专用自动测速组：只合并塞入新、日、韩、美（完美剔除香港节点）
        else if (group.tag === "AI-Auto") {
          const aiNodes = [...sgNodes, ...jpNodes, ...krNodes, ...usNodes];
          group.outbounds.push(...aiNodes);
        }
        // 国别具体策略组映射
        else if (group.tag === "香港 (HK)") group.outbounds.push(...hkNodes);
        else if (group.tag === "新加坡 (SG)") group.outbounds.push(...sgNodes);
        else if (group.tag === "日本 (JP)") group.outbounds.push(...jpNodes);
        else if (group.tag === "韩国 (KR)") group.outbounds.push(...krNodes);
        else if (group.tag === "美国 (US)") group.outbounds.push(...usNodes);
        else if (group.tag === "其它地区") group.outbounds.push(...otherNodes);
      });

      // 7. 组内去重与空策略组的防错兜底
      config.outbounds.forEach(group => {
        if (Array.isArray(group.outbounds)) {
          group.outbounds = [...new Set(group.outbounds)];
          
          // 如果某个国家策略组没有匹配到任何节点，塞入一个 "Direct-Out" 兜底，防止 sing-box 因空组报错
          if (group.outbounds.length === 0 && group.tag !== "Auto" && group.tag !== "AI-Auto") {
            group.outbounds.push("Direct-Out");
          }
        }
      });

      // 8. 将洗干净后的实体节点对象，正式追加到最外层的 outbounds 中供底层调用
      config.outbounds.push(...proxies);
      console.log("[AI国别分组] 策略组及实体节点注入成功！");
    }
  } catch (e) {
    console.log("[AI国别分组] 严重错误：生成节点失败: " + e.message);
  }

  // 9. 输出最终配置 (完全对齐 merge_all.js 规范)
  $content = JSON.stringify(config, null, 2);
}