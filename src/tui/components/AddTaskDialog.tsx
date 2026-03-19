/**
 * OpenCode Task Manager Plugin - 添加任务对话框组件
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { TaskPriority, CreateTaskInput } from "../../types";

/**
 * 添加任务对话框属性
 */
interface AddTaskDialogProps {
  onSubmit: (input: CreateTaskInput) => void;
  onCancel: () => void;
}

/**
 * 添加任务对话框组件
 */
export function AddTaskDialog({ onSubmit, onCancel }: AddTaskDialogProps) {
  // 表单状态
  const [title, setTitle] = useState("");
  const [agent, setAgent] = useState("explore");
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [retryCount, setRetryCount] = useState(0);

  // 当前焦点字段
  const [focusedField, setFocusedField] = useState<"title" | "agent" | "prompt" | "priority" | "retryCount">("title");

  // 可用的 agent 列表
  const availableAgents = ["explore", "oracle", "build", "librarian"];
  const agentIndex = availableAgents.indexOf(agent);

  // 优先级列表
  const priorities: TaskPriority[] = ["high", "medium", "low"];
  const priorityIndex = priorities.indexOf(priority);

  // 处理输入
  useInput((input, key) => {
    // Tab 切换字段
    if (key.tab) {
      const fields: Array<"title" | "agent" | "prompt" | "priority" | "retryCount"> = ["title", "agent", "prompt", "priority", "retryCount"];
      const currentIndex = fields.indexOf(focusedField);
      const nextIndex = key.shift ? (currentIndex - 1 + fields.length) % fields.length : (currentIndex + 1) % fields.length;
      setFocusedField(fields[nextIndex]);
      return;
    }

    // Escape 取消
    if (key.escape) {
      onCancel();
      return;
    }

    // Enter 提交
    if (key.return) {
      if (focusedField === "retryCount") {
        handleSubmit();
      } else {
        // 移动到下一个字段
        const fields: Array<"title" | "agent" | "prompt" | "priority" | "retryCount"> = ["title", "agent", "prompt", "priority", "retryCount"];
        const currentIndex = fields.indexOf(focusedField);
        setFocusedField(fields[currentIndex + 1]);
      }
      return;
    }

    // 根据当前字段处理输入
    switch (focusedField) {
      case "title":
        if (key.backspace || key.delete) {
          setTitle((prev) => prev.slice(0, -1));
        } else if (input && !key.return) {
          setTitle((prev) => prev + input);
        }
        break;

      case "agent":
        if (key.leftArrow) {
          setAgent(availableAgents[(agentIndex - 1 + availableAgents.length) % availableAgents.length]);
        } else if (key.rightArrow) {
          setAgent(availableAgents[(agentIndex + 1) % availableAgents.length]);
        }
        break;

      case "prompt":
        if (key.backspace || key.delete) {
          setPrompt((prev) => prev.slice(0, -1));
        } else if (input && !key.return) {
          setPrompt((prev) => prev + input);
        }
        break;

      case "priority":
        if (key.leftArrow) {
          setPriority(priorities[(priorityIndex - 1 + priorities.length) % priorities.length]);
        } else if (key.rightArrow) {
          setPriority(priorities[(priorityIndex + 1) % priorities.length]);
        }
        break;

      case "retryCount":
        if (key.upArrow) {
          setRetryCount((prev) => Math.min(10, prev + 1));
        } else if (key.downArrow) {
          setRetryCount((prev) => Math.max(0, prev - 1));
        }
        break;
    }
  });

  // 提交表单
  const handleSubmit = () => {
    if (!title.trim() || !prompt.trim()) {
      return;
    }

    onSubmit({
      title: title.trim(),
      agent,
      prompt: prompt.trim(),
      priority,
      retryCount,
      source: "manual",
    });
  };

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          添加新任务
        </Text>
      </Box>

      {/* 标题字段 */}
      <Box marginBottom={1}>
        <Text color={focusedField === "title" ? "cyan" : "gray"}>标题: </Text>
        <Box borderStyle="single" borderColor={focusedField === "title" ? "cyan" : "gray"}>
          <Text>{title || "输入任务标题..."}</Text>
        </Box>
      </Box>

      {/* Agent 字段 */}
      <Box marginBottom={1}>
        <Text color={focusedField === "agent" ? "cyan" : "gray"}>Agent: </Text>
        <Box flexDirection="row">
          {availableAgents.map((a, i) => (
            <Box key={a} marginX={1}>
              <Text
                color={a === agent ? "green" : "gray"}
                bold={a === agent}
              >
                {i === agentIndex ? `[${a}]` : ` ${a} `}
              </Text>
            </Box>
          ))}
        </Box>
        <Text color="gray"> [←/→ 选择]</Text>
      </Box>

      {/* Prompt 字段 */}
      <Box marginBottom={1} flexDirection="column">
        <Text color={focusedField === "prompt" ? "cyan" : "gray"}>Prompt:</Text>
        <Box
          borderStyle="single"
          borderColor={focusedField === "prompt" ? "cyan" : "gray"}
          minHeight={3}
        >
          <Text>{prompt || "输入任务 prompt..."}</Text>
        </Box>
      </Box>

      {/* 优先级字段 */}
      <Box marginBottom={1}>
        <Text color={focusedField === "priority" ? "cyan" : "gray"}>优先级: </Text>
        <Box flexDirection="row">
          {priorities.map((p) => (
            <Box key={p} marginX={1}>
              <Text
                color={p === priority ? "yellow" : "gray"}
                bold={p === priority}
              >
                {p === priority ? `[${p}]` : ` ${p} `}
              </Text>
            </Box>
          ))}
        </Box>
        <Text color="gray"> [←/→ 选择]</Text>
      </Box>

      {/* 重试次数字段 */}
      <Box marginBottom={1}>
        <Text color={focusedField === "retryCount" ? "cyan" : "gray"}>重试次数: </Text>
        <Text color="white">{retryCount}</Text>
        <Text color="gray"> [↑/↓ 调整]</Text>
      </Box>

      {/* 操作按钮 */}
      <Box justifyContent="center" marginTop={1}>
        <Box borderStyle="single" borderColor="green" paddingX={2}>
          <Text color="green">[Enter] 确定</Text>
        </Box>
        <Box marginX={2}>
          <Text color="gray">|</Text>
        </Box>
        <Box borderStyle="single" borderColor="red" paddingX={2}>
          <Text color="red">[Esc] 取消</Text>
        </Box>
      </Box>

      {/* 提示 */}
      <Box marginTop={1}>
        <Text color="gray">Tab 切换字段</Text>
      </Box>
    </Box>
  );
}