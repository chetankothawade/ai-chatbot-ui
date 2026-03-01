import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import SimpleBar from "simplebar-react";
import Swal from "sweetalert2";
import { useForm } from "react-hook-form";

import {
  Row,
  Col,
  Card,
  Form,
  Button,
  ListGroup,
  Spinner,
  InputGroup,
  Dropdown,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap";

import LayoutWrapper from "../components/LayoutWrapper";
import chatbotService from "../../../services/chatbotService";
import userService from "../../../services/userService";
import useInfiniteScrollPagination from "../../../hooks/UseInfiniteScrollPagination";
import AddParticipantModal from "./modals/AddParticipantModal";
import RemoveParticipantModal from "./modals/RemoveParticipantModal";

const CHAT_FILTERS = {
  ALL: "all",
  TODAY: "today",
  WEEK: "week",
};

const MODEL_OPTIONS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "gpt-4o"];

const ButtonTooltip = ({ id, title, children, placement = "top" }) => (
  <OverlayTrigger placement={placement} overlay={<Tooltip id={id}>{title}</Tooltip>}>
    <span className="d-inline-flex">{children}</span>
  </OverlayTrigger>
);

// Normalizes pin flags from different backend field names.
const isPinnedChat = (chat) => Boolean(chat?.pinned ?? chat?.is_pinned);

// Detects generic/default chat titles that should be auto-replaced.
const isSystemTitle = (title) => {
  const value = (title || "").trim().toLowerCase();
  return !value || /^chat\s*#?\s*\d+$/.test(value) || value === "new chat";
};

// Builds a short title from the first few words of the first user message.
const generateTitleFromMessage = (message) => {
  const cleaned = (message || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "New Chat";
  return cleaned.split(" ").slice(0, 7).join(" ");
};

// Generic helper to parse APIs that may return arrays in different wrappers.
const normalizeArrayPayload = (payload, candidates) => {
  if (Array.isArray(payload)) return payload;
  return candidates.find(Array.isArray) || [];
};

// Normalizes chat list payload from backend variants.
const normalizeChats = (payload) =>
  normalizeArrayPayload(payload, [
    payload?.data,
    payload?.data?.data,
    payload?.data?.sessions,
    payload?.sessions,
    payload?.results,
  ]);

// Normalizes pagination metadata from backend variants.
const normalizePagination = (payload) =>
  payload?.pagination ||
  payload?.data?.pagination ||
  payload?.meta?.pagination ||
  null;

// Normalizes messages payload from backend variants.
const normalizeMessages = (payload) =>
  normalizeArrayPayload(payload, [payload?.messages, payload?.data?.messages, payload?.data]);

// Normalizes single-session payload from backend variants.
const normalizeSession = (payload) =>
  payload?.session || payload?.chat || payload?.data?.session || payload?.data?.chat || null;

// Applies search/filter and keeps pinned chats at the top.
const filterAndSortChats = (chats, search, filter) => {
  const query = search.trim().toLowerCase();
  const now = new Date();

  const filtered = chats.filter((chat) => {
    const title = (chat.title || `Chat #${chat.id}`).toLowerCase();
    const matchSearch = !query || title.includes(query);

    const stamp = chat.updated_at || chat.created_at;
    const date = stamp ? new Date(stamp) : null;
    const isValidDate = date instanceof Date && !Number.isNaN(date.getTime());

    let matchFilter = true;
    if (filter === CHAT_FILTERS.TODAY && isValidDate) {
      matchFilter = date.toDateString() === now.toDateString();
    } else if (filter === CHAT_FILTERS.WEEK && isValidDate) {
      matchFilter = now.getTime() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
    }

    return matchSearch && matchFilter;
  });

  return filtered.sort((a, b) => {
    const aPinned = isPinnedChat(a);
    const bPinned = isPinnedChat(b);
    if (aPinned === bPinned) return 0;
    return aPinned ? -1 : 1;
  });
};

// Fallback clipboard copy for non-secure contexts or unsupported Clipboard API.
const fallbackCopyText = (text) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);

  const selection = document.getSelection();
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textArea.focus();
  textArea.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
    if (selectedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
  }
  return ok;
};

// Clipboard copy with modern API first and robust fallback.
const copyTextToClipboard = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }
  return fallbackCopyText(text);
};

// Normalizes abort/cancel detection across fetch/axios/browser variants.
const isCanceledStreamError = (error) =>
  error?.name === "CanceledError" ||
  error?.name === "AbortError" ||
  error?.code === "ERR_CANCELED" ||
  String(error?.message || "").toLowerCase() === "canceled";

const Chatbot = () => {
  // Shared panel height keeps sidebar and chat area visually aligned.
  const panelHeight = "clamp(520px, calc(100dvh - 250px), 760px)";

  const [sending, setSending] = useState(false);

  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [input, setInput] = useState("");

  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState(CHAT_FILTERS.ALL);
  const [searchingChats, setSearchingChats] = useState(false);
  const [searchedChats, setSearchedChats] = useState([]);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [hoveredMessageKey, setHoveredMessageKey] = useState(null);
  const [copiedCodeKey, setCopiedCodeKey] = useState("");
  const [blinkOn, setBlinkOn] = useState(true);
  const [selectedModel, setSelectedModel] = useState("");
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [showRemoveParticipantModal, setShowRemoveParticipantModal] = useState(false);
  const [participantUserOptions, setParticipantUserOptions] = useState([]);
  const [sessionParticipantOptions, setSessionParticipantOptions] = useState([]);
  const [loadingParticipantUsers, setLoadingParticipantUsers] = useState(false);
  const [loadingSessionParticipants, setLoadingSessionParticipants] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [removingParticipant, setRemovingParticipant] = useState(false);

  // Refs for managing scroll, streaming, and typing effects.
  const bottomRef = useRef(null);
  const streamControllerRef = useRef(null);
  const typingIntervalRef = useRef(null);
  const typingBufferRef = useRef("");
  const draftAssistantIdRef = useRef(null);
  const chatListRef = useRef(null);
  const {
    control,
    register,
    reset,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    defaultValues: {
      user_id: null,
    },
  });
  const {
    control: removeControl,
    register: removeRegister,
    reset: resetRemove,
    handleSubmit: handleRemoveSubmit,
    formState: { errors: removeErrors, touchedFields: removeTouchedFields },
  } = useForm({
    defaultValues: {
      user_id: null,
    },
  });

  // Updates both list and active chat in one place to keep state consistent.
  const patchChatState = useCallback((chatId, patch) => {
    setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, ...patch } : chat)));
    setActiveChat((prev) => (prev?.id === chatId ? { ...prev, ...patch } : prev));
  }, []);

  // Clears the incremental typing timer safely.
  const stopTypingTicker = useCallback(() => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  }, []);

  // Appends streamed assistant text to the active draft message only.
  const appendAssistantText = useCallback((text) => {
    const draftId = draftAssistantIdRef.current;
    if (!draftId || !text) return;

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === draftId ? { ...msg, content: `${msg.content || ""}${text}` } : msg
      )
    );
  }, []);

  // Flushes any pending stream buffer instantly (used on stream end/abort).
  const flushTypingBuffer = useCallback(() => {
    if (!typingBufferRef.current) return;
    appendAssistantText(typingBufferRef.current);
    typingBufferRef.current = "";
  }, [appendAssistantText]);

  // Simulates ChatGPT-like typing by draining buffered chunks in small steps.
  const startTypingTicker = useCallback(() => {
    if (typingIntervalRef.current) return;

    typingIntervalRef.current = setInterval(() => {
      if (!typingBufferRef.current) return;
      const step = typingBufferRef.current.slice(0, 2);
      typingBufferRef.current = typingBufferRef.current.slice(2);
      appendAssistantText(step);
    }, 20);
  }, [appendAssistantText]);

  // Loads a page of chats and manages pagination state based on backend response.
  const loadChatsPage = useCallback(async ({ cursor = null, append = false } = {}) => {
    try {
      const response = await chatbotService.listSessions(cursor ? { cursor } : {});
      const payload = response?.data;
      const newChats = normalizeChats(payload);
      const pagination = normalizePagination(payload);

      setChats((prev) => (append ? [...prev, ...newChats] : newChats));

      return { nextCursor: pagination?.next_cursor ?? null };
    } catch {
      toast.error("Failed to load chats");
      if (!append) setChats([]);
      throw new Error("Failed to load chats");
    }
  }, []);

  // Uses the infinite scroll hook to manage loading more chats as the user scrolls.
  const {
    loading,
    loadingMore,
    hasMore,
    handleScroll,
    loadFirstPage,
  } = useInfiniteScrollPagination({
    containerRef: chatListRef,
    onLoadPage: loadChatsPage,
    disabled: Boolean(chatSearch.trim()),
    itemsLength: chats.length,
  });

  // Fetches a selected chat's messages and resets inline rename mode.
  const loadChat = useCallback(async (chatId) => {
    setRenamingChatId(null);
    const localChat = chats.find((chat) => chat.id === chatId);
    setActiveChat(localChat || { id: chatId });
    try {
      const response = await chatbotService.getSession(chatId);
      const payload = response?.data;
      const session = normalizeSession(payload);
      if (session) {
        setActiveChat((prev) => ({ ...(prev || {}), ...session }));
        setSelectedModel(session?.model || "");
      }
      setMessages(normalizeMessages(payload));
    } catch {
      toast.error("Failed to load chat messages");
      setMessages([]);
    }
  }, [chats]);

  // Prevents row-click when interactions originate from action controls.
  const handleChatItemClick = (chatId, event) => {
    if (event?.target?.closest?.('[data-chat-actions="true"]')) return;
    loadChat(chatId);
  };

  // Copies code block content and manages transient copied-state UI.
  const handleCopyCode = async (codeText, key) => {
    const copied = await copyTextToClipboard(codeText);
    if (!copied) {
      toast.error("Failed to copy code");
      return;
    }

    setCopiedCodeKey(key);
    setTimeout(() => {
      setCopiedCodeKey((prev) => (prev === key ? "" : prev));
    }, 1400);
  };

  // Auto-titles untitled chats from the first prompt to improve chat list clarity.
  const autoGenerateChatTitleIfNeeded = useCallback(
    (chatId, currentInput) => {
      const currentChat = chats.find((chat) => chat.id === chatId);
      const existingTitle = activeChat?.title || currentChat?.title || "";
      if (!isSystemTitle(existingTitle)) return;

      const generatedTitle = generateTitleFromMessage(currentInput);
      chatbotService
        .renameSession(chatId, generatedTitle)
        .then(() => patchChatState(chatId, { title: generatedTitle }))
        .catch(() => { });
    },
    [activeChat?.title, chats, patchChatState]
  );

  // Sends user message and streams assistant response with typing effect.
  const sendMessage = async () => {
    if (!input.trim() || !activeChat?.id || sending) return;

    const currentInput = input.trim();
    const draftAssistantId = `draft-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: currentInput },
      { id: draftAssistantId, role: "assistant", content: "" },
    ]);

    setInput("");
    setSending(true);
    typingBufferRef.current = "";
    draftAssistantIdRef.current = draftAssistantId;

    const controller = new AbortController();
    streamControllerRef.current = controller;

    try {
      autoGenerateChatTitleIfNeeded(activeChat.id, currentInput);

      await chatbotService.streamMessage({
        chatId: activeChat.id,
        message: currentInput,
        signal: controller.signal,
        onChunk: (chunk) => {
          typingBufferRef.current += chunk;
          startTypingTicker();
        },
      });

      loadFirstPage();
    } catch (error) {
      if (!isCanceledStreamError(error)) {
        toast.error("Streaming failed");
      }
    } finally {
      flushTypingBuffer();
      stopTypingTicker();
      streamControllerRef.current = null;
      draftAssistantIdRef.current = null;
      setSending(false);
    }
  };

  // Creates a fresh chat session and refreshes sidebar list.
  const handleNewChat = async () => {
    try {
      const response = await chatbotService.createSession();
      const nextChat = response?.data?.data || response?.data;
      setActiveChat(nextChat || null);
      setSelectedModel(nextChat?.model || "");
      setMessages([]);
      await loadFirstPage();
    } catch {
      toast.error("Failed to create chat");
    }
  };

  // Enables inline rename mode for a chat row.
  const handleRenameStart = (chat) => {
    setRenamingChatId(chat.id);
    setRenameValue(chat.title || "");
  };

  // Persists edited chat title and updates local state.
  const handleRenameSave = async (chatId) => {
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;

    try {
      await chatbotService.renameSession(chatId, nextTitle);
      patchChatState(chatId, { title: nextTitle });
      setRenamingChatId(null);
      setRenameValue("");
      toast.success("Chat renamed");
    } catch {
      toast.error("Failed to rename chat");
    }
  };

  // Confirms and deletes a chat session.
  const handleDeleteChat = async (chatId) => {
    const confirm = await Swal.fire({
      title: "Delete chat?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });

    if (!confirm.isConfirmed) return;

    try {
      await chatbotService.deleteSession(chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (activeChat?.id === chatId) {
        setActiveChat(null);
        setMessages([]);
      }
      toast.success("Chat deleted");
    } catch {
      toast.error("Failed to delete chat");
    }
  };

  // Toggles pinned status and keeps local item flags synchronized.
  const handleTogglePin = async (chat) => {
    const nextPinned = !isPinnedChat(chat);
    try {
      await chatbotService.togglePin(chat.id);
      patchChatState(chat.id, { pinned: nextPinned, is_pinned: nextPinned });
    } catch {
      toast.error("Failed to update pin status");
    }
  };

  // Clears all messages in the current session.
  const handleClearMessages = async () => {
    if (!activeChat?.id) return;

    const confirm = await Swal.fire({
      title: "Clear all messages?",
      text: "This removes all messages from this session.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Clear",
    });

    if (!confirm.isConfirmed) return;

    try {
      await chatbotService.clearSessionMessages(activeChat.id);
      setMessages([]);
      toast.success("Messages cleared");
    } catch {
      toast.error("Failed to clear messages");
    }
  };

  // Updates model for active session.
  const handleModelChange = async (event) => {
    const nextModel = event.target.value;
    setSelectedModel(nextModel);
    if (!activeChat?.id || !nextModel) return;

    try {
      await chatbotService.updateSessionModel(activeChat.id, nextModel);
      patchChatState(activeChat.id, { model: nextModel });
      toast.success("Model updated");
    } catch {
      toast.error("Failed to update model");
    }
  };

  // Opens prompt to edit session context.
  const handleEditContext = async () => {
    if (!activeChat?.id) return;

    const currentContext =
      activeChat?.context && typeof activeChat.context === "object"
        ? JSON.stringify(activeChat.context, null, 2)
        : "";

    const result = await Swal.fire({
      title: "Edit session context",
      input: "textarea",
      inputValue: currentContext,
      inputLabel: "Context JSON",
      inputPlaceholder: '{"system":"You are a helpful assistant."}',
      inputAttributes: {
        rows: "8",
      },
      showCancelButton: true,
      confirmButtonText: "Save",
    });

    if (!result.isConfirmed) return;

    const rawValue = (result.value || "").trim();
    let nextContext = null;

    if (rawValue) {
      try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== "object") {
          toast.error("Context must be a JSON object/array");
          return;
        }
        nextContext = parsed;
      } catch {
        nextContext = { system: rawValue };
      }
    }

    try {
      await chatbotService.updateSessionContext(activeChat.id, nextContext);
      patchChatState(activeChat.id, { context: nextContext });
      toast.success("Context updated");
    } catch {
      toast.error("Failed to update context");
    }
  };

  // Shows overall usage payload.
  const handleOpenUsage = async () => {
    try {
      const response = await chatbotService.getUsage();
      const payload = response?.data;
      await Swal.fire({
        title: "Usage",
        html: `<pre style="text-align:left;max-height:320px;overflow:auto;margin:0;">${JSON.stringify(
          payload,
          null,
          2
        )}</pre>`,
        width: 700,
      });
    } catch {
      toast.error("Failed to load usage");
    }
  };

  // Shows usage payload for active chat.
  const handleOpenChatUsage = async () => {
    if (!activeChat?.id) return;
    try {
      const response = await chatbotService.getChatUsage(activeChat.id);
      const payload = response?.data;
      await Swal.fire({
        title: `Chat Usage #${activeChat.id}`,
        html: `<pre style="text-align:left;max-height:320px;overflow:auto;margin:0;">${JSON.stringify(
          payload,
          null,
          2
        )}</pre>`,
        width: 700,
      });
    } catch {
      toast.error("Failed to load chat usage");
    }
  };

  // Loads users for autosuggest participant selection.
  const loadParticipantUsers = useCallback(async () => {
    setLoadingParticipantUsers(true);
    try {
      const response = await userService.getList();
      const payload = response?.data?.data;
      const users = Array.isArray(payload) ? payload : [];
      const options = users.map((user) => ({
        value: Number(user.id),
        label: `${user.name} (#${user.id})`,
      }));
      setParticipantUserOptions(options);
    } catch {
      setParticipantUserOptions([]);
      toast.error("Failed to load users");
    } finally {
      setLoadingParticipantUsers(false);
    }
  }, []);

  // Loads only users already added as participants in active chat.
  const loadSessionParticipants = useCallback(async () => {
    if (!activeChat?.id) {
      setSessionParticipantOptions([]);
      return;
    }

    setLoadingSessionParticipants(true);
    try {
      const response = await chatbotService.listParticipants(activeChat.id);
      const payload = response?.data?.data;
      const participants = Array.isArray(payload) ? payload : [];

      const options = participants.map((participant) => ({
        value: Number(participant.user_id),
        label: `${participant?.user?.name || "User"} (#${participant.user_id})`,
      }));

      setSessionParticipantOptions(options);
    } catch {
      setSessionParticipantOptions([]);
      toast.error("Failed to load chat participants");
    } finally {
      setLoadingSessionParticipants(false);
    }
  }, [activeChat?.id]);

  // Opens modal and preloads user list for participant picker.
  const handleAddParticipant = async () => {
    if (!activeChat?.id) return;
    reset({ user_id: null });
    setShowAddParticipantModal(true);
    await loadParticipantUsers();
  };

  // Submits selected participant to current session.
  const handleAddParticipantSubmit = async (formValues) => {
    if (!activeChat?.id) return;
    const userId = Number(formValues?.user_id);

    if (!userId) {
      toast.error("Please select a user");
      return;
    }

    try {
      setAddingParticipant(true);
      await chatbotService.addParticipant(activeChat.id, userId);
      toast.success("Participant added");
      setShowAddParticipantModal(false);
      reset({ user_id: null });
    } catch {
      toast.error("Failed to add participant");
    } finally {
      setAddingParticipant(false);
    }
  };

  // Opens modal and preloads user list for participant removal.
  const handleRemoveParticipant = async () => {
    if (!activeChat?.id) return;
    resetRemove({ user_id: null });
    setShowRemoveParticipantModal(true);
    await loadSessionParticipants();
  };

  // Removes selected participant from current session.
  const handleRemoveParticipantSubmit = async (formValues) => {
    if (!activeChat?.id) return;
    const userId = Number(formValues?.user_id);

    if (!userId) {
      toast.error("Please select a user");
      return;
    }

    try {
      setRemovingParticipant(true);
      await chatbotService.removeParticipant(activeChat.id, userId);
      toast.success("Participant removed");
      setShowRemoveParticipantModal(false);
      resetRemove({ user_id: null });
    } catch {
      toast.error("Failed to remove participant");
    } finally {
      setRemovingParticipant(false);
    }
  };

  // Deletes a message and refreshes local list.
  const handleDeleteMessage = async (messageId) => {
    const confirm = await Swal.fire({
      title: "Delete message?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirm.isConfirmed) return;

    try {
      await chatbotService.deleteMessage(messageId);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      toast.success("Message deleted");
    } catch {
      toast.error("Failed to delete message");
    }
  };

  // Regenerates response for a selected message and reloads thread.
  const handleRegenerateMessage = async (messageId) => {
    if (!activeChat?.id) return;
    try {
      await chatbotService.regenerateMessage(messageId);
      await loadChat(activeChat.id);
      toast.success("Response regenerated");
    } catch {
      toast.error("Failed to regenerate response");
    }
  };

  // Displays metadata JSON for a message.
  const handleViewMetadata = async (messageId) => {
    try {
      const response = await chatbotService.getMetadata(messageId);
      await Swal.fire({
        title: `Metadata #${messageId}`,
        html: `<pre style="text-align:left;max-height:320px;overflow:auto;margin:0;">${JSON.stringify(
          response?.data,
          null,
          2
        )}</pre>`,
        width: 700,
      });
    } catch {
      toast.error("Failed to fetch metadata");
    }
  };

  // Saves metadata JSON for a message.
  const handleSaveMetadata = async (messageId) => {
    const result = await Swal.fire({
      title: "Save Metadata",
      input: "textarea",
      inputLabel: "JSON",
      inputValue: "{}",
      showCancelButton: true,
      confirmButtonText: "Save",
    });
    if (!result.isConfirmed) return;

    let metadataBody = {};
    try {
      metadataBody = JSON.parse(result.value || "{}");
    } catch {
      toast.error("Invalid JSON");
      return;
    }

    if (!metadataBody || typeof metadataBody !== "object" || Array.isArray(metadataBody)) {
      toast.error("Metadata must be a JSON object");
      return;
    }

    try {
      await chatbotService.storeMetadata(messageId, {
        type: "manual",
        meta: metadataBody,
      });
      toast.success("Metadata saved");
    } catch {
      toast.error("Failed to save metadata");
    }
  };

  // Derives final chat list for rendering based on active search/filter rules.
  const chatsSource = chatSearch.trim() ? searchedChats : chats;

  const filteredChats = useMemo(
    () => filterAndSortChats(chatsSource, "", chatFilter),
    [chatsSource, chatFilter]
  );

  // Initial load.
  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  // Keeps local model selector aligned when active chat changes.
  useEffect(() => {
    setSelectedModel(activeChat?.model || "");
  }, [activeChat?.id, activeChat?.model]);

  // Uses sessions endpoint with search param for chat sidebar search.
  useEffect(() => {
    const term = chatSearch.trim();
    if (!term) {
      setSearchedChats([]);
      setSearchingChats(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSearchingChats(true);
      try {
        const response = await chatbotService.listSessions({ search: term, limit: 50 });
        setSearchedChats(normalizeChats(response?.data));
      } catch {
        setSearchedChats([]);
      } finally {
        setSearchingChats(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [chatSearch]);

  // Keeps latest message in view while chatting/streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Blinking cursor state for in-progress assistant stream.
  useEffect(() => {
    if (!sending) {
      setBlinkOn(true);
      return undefined;
    }

    const intervalId = setInterval(() => setBlinkOn((prev) => !prev), 450);
    return () => clearInterval(intervalId);
  }, [sending]);

  // Cleanup for unmount: abort network stream and clear timers.
  useEffect(
    () => () => {
      streamControllerRef.current?.abort();
      stopTypingTicker();
    },
    [stopTypingTicker]
  );

  const addParticipantFields = [
    {
      type: "react_select",
      name: "user_id",
      label: "User",
      placeholder: loadingParticipantUsers ? "Loading users..." : "Select user",
      options: participantUserOptions,
      disabled: loadingParticipantUsers || addingParticipant,
      rules: { required: "Please select a user" },
      col: 12,
    },
  ];
  const removeParticipantFields = [
    {
      type: "react_select",
      name: "user_id",
      label: "User",
      placeholder: loadingSessionParticipants ? "Loading participants..." : "Select participant",
      options: sessionParticipantOptions,
      disabled: loadingSessionParticipants || removingParticipant,
      rules: { required: "Please select a user" },
      col: 12,
    },
  ];

  return (
    <LayoutWrapper>
      {loading ? (
        <Card className="shadow-sm">
          <Card.Body className="d-flex flex-column align-items-center justify-content-center py-5">
            <Spinner animation="border" variant="primary" />
            <div className="text-muted mt-3">Loading chats...</div>
          </Card.Body>
        </Card>
      ) : (
        <>
          <Row>
            <Col>
              <div className="page-title-box d-flex align-items-center justify-content-between mb-2">
                <h4 className="mb-0">AI Chatbot</h4>
                <div className="page-title-right">
                  <ol className="breadcrumb m-0">
                    <li className="breadcrumb-item">
                      <Link to="/dashboard">Dashboard</Link>
                    </li>
                    <li className="breadcrumb-item active">Chatbot</li>
                  </ol>
                </div>
              </div>
            </Col>
          </Row>

          <Row className="mb-2 align-items-center">
            <Col>
              <small className="text-muted">Ask anything and get instant responses</small>
            </Col>
            <Col className="text-end d-flex justify-content-end gap-2">
              <ButtonTooltip id="tt-usage" title="View overall token and usage stats">
                <Button variant="outline-secondary" onClick={handleOpenUsage}>
                  Usage
                </Button>
              </ButtonTooltip>
              <ButtonTooltip id="tt-new-chat" title="Create a new chat session">
                <Button variant="primary" onClick={handleNewChat} className="btn-soft-primary">
                  + New Chat
                </Button>
              </ButtonTooltip>
            </Col>
          </Row>

          <Row className="g-3 align-items-stretch">
            <Col lg={3} md={4} className="d-flex">
              <Card className="shadow-sm w-100 d-flex flex-column" style={{ height: panelHeight }}>
                <Card.Header className="bg-white fw-semibold">Chats</Card.Header>
                <Card.Body className="pb-2">
                  <Form.Control
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Search chats..."
                    className="mb-2"
                  />
                  {searchingChats && <div className="small text-muted mb-2">Searching...</div>}
                  <Form.Select value={chatFilter} onChange={(e) => setChatFilter(e.target.value)}>
                    <option value={CHAT_FILTERS.ALL}>All Chats</option>
                    <option value={CHAT_FILTERS.TODAY}>Today</option>
                    <option value={CHAT_FILTERS.WEEK}>Last 7 Days</option>
                  </Form.Select>
                </Card.Body>

                <div className="flex-grow-1" style={{ minHeight: 0 }}>
                  <SimpleBar
                    style={{ height: "100%", maxHeight: "100%" }}
                    scrollableNodeProps={{
                      ref: chatListRef,
                      onScroll: handleScroll,
                    }}
                  >
                    <ListGroup variant="flush">
                      {filteredChats.length === 0 ? (
                        <div className="p-3 text-muted small">No chats found</div>
                      ) : (
                        filteredChats.map((chat) => {
                          const isPinned = isPinnedChat(chat);
                          const showActions = hoveredChatId === chat.id || activeChat?.id === chat.id;

                          return (
                            <ListGroup.Item
                              key={chat.id}
                              as="div"
                              role="button"
                              tabIndex={0}
                              active={activeChat?.id === chat.id}
                              onClick={(e) => handleChatItemClick(chat.id, e)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleChatItemClick(chat.id, e);
                                }
                              }}
                              onMouseEnter={() => setHoveredChatId(chat.id)}
                              onMouseLeave={() => setHoveredChatId(null)}
                            >
                              {renamingChatId === chat.id ? (
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Form.Control
                                    size="sm"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="mb-2"
                                  />
                                  <div className="d-flex gap-1">
                                    <ButtonTooltip id={`tt-rename-save-${chat.id}`} title="Save chat title">
                                      <Button size="sm" onClick={() => handleRenameSave(chat.id)}>
                                        Save
                                      </Button>
                                    </ButtonTooltip>
                                    <ButtonTooltip id={`tt-rename-cancel-${chat.id}`} title="Cancel rename">
                                      <Button
                                        size="sm"
                                        variant="outline-secondary"
                                        onClick={() => {
                                          setRenamingChatId(null);
                                          setRenameValue("");
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </ButtonTooltip>
                                  </div>
                                </div>
                              ) : (
                                <div className="d-flex align-items-center justify-content-between gap-2">
                                  <span className="text-truncate d-flex align-items-center gap-1">
                                    {isPinned && <i className="ri-pushpin-fill" />}
                                    <span>{chat.title || `Chat #${chat.id}`}</span>
                                  </span>
                                  <div
                                    className="d-flex"
                                    data-chat-actions="true"
                                    style={{
                                      opacity: showActions ? 1 : 0,
                                      pointerEvents: showActions ? "auto" : "none",
                                      transition: "opacity 0.15s ease-in-out",
                                    }}
                                  >
                                    <Dropdown align="end" drop="end">
                                      <ButtonTooltip id={`tt-chat-actions-${chat.id}`} title="Open chat actions">
                                        <Dropdown.Toggle
                                          as="button"
                                          className="btn btn-sm p-0 border-0 bg-transparent shadow-none chat-more-toggle"
                                        >
                                          <i className="ri-more-2-fill fs-4" />
                                        </Dropdown.Toggle>
                                      </ButtonTooltip>

                                      <Dropdown.Menu className="shadow-sm border-0 py-2">
                                        <Dropdown.Item onClick={() => handleTogglePin(chat)}>
                                          <i className="ri-pushpin-line me-1" />{isPinned ? "Unpin" : "Pin"}
                                        </Dropdown.Item>
                                        <Dropdown.Item onClick={() => handleRenameStart(chat)}>
                                          <i className="ri-edit-2-line me-1" />Rename
                                        </Dropdown.Item>
                                        <Dropdown.Divider />
                                        <Dropdown.Item className="text-danger" onClick={() => handleDeleteChat(chat.id)}>
                                          <i className="ri-delete-bin-line me-1" />Delete
                                        </Dropdown.Item>
                                      </Dropdown.Menu>
                                    </Dropdown>
                                  </div>
                                </div>
                              )}
                            </ListGroup.Item>
                          );
                        })
                      )}
                      {loadingMore && (
                        <div className="text-center py-2">
                          <Spinner size="sm" />
                        </div>
                      )}
                      {!chatSearch.trim() && !hasMore && (
                        <div className="text-center text-muted small py-2">
                          No more chats
                        </div>
                      )}
                    </ListGroup>
                  </SimpleBar>
                </div>
              </Card>
            </Col>
            {/* // The main chat panel with messages and controls. */}
            <Col lg={9} md={8} className="d-flex">
              <Card className="shadow-sm d-flex flex-column w-100 user-chat" style={{ height: panelHeight }}>
                <Card.Header className="bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 ">
                  <div className="fw-semibold text-truncate">
                    {activeChat?.title || (activeChat?.id ? `Chat #${activeChat.id}` : "Conversation")}
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <Form.Select
                      size="sm"
                      value={selectedModel}
                      onChange={handleModelChange}
                      disabled={!activeChat?.id}
                      style={{ width: 150 }}
                    >
                      <option value="">Model</option>
                      {MODEL_OPTIONS.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </Form.Select>
                    <ButtonTooltip id="tt-context" title="Edit system context for this chat">
                      <Button size="sm" variant="outline-secondary" onClick={handleEditContext} disabled={!activeChat?.id}>
                        Context
                      </Button>
                    </ButtonTooltip>
                    <ButtonTooltip id="tt-chat-usage" title="View usage for this chat only">
                      <Button size="sm" variant="outline-secondary" onClick={handleOpenChatUsage} disabled={!activeChat?.id}>
                        Chat Usage
                      </Button>
                    </ButtonTooltip>
                    <ButtonTooltip id="tt-add-user" title="Add a participant to this chat">
                      <Button size="sm" variant="outline-secondary" onClick={handleAddParticipant} disabled={!activeChat?.id}>
                        Add User
                      </Button>
                    </ButtonTooltip>
                    <ButtonTooltip id="tt-remove-user" title="Remove a participant from this chat">
                      <Button size="sm" variant="outline-secondary" onClick={handleRemoveParticipant} disabled={!activeChat?.id}>
                        Remove User
                      </Button>
                    </ButtonTooltip>
                    <ButtonTooltip id="tt-clear-messages" title="Delete all messages in this chat">
                      <Button size="sm" variant="outline-danger" onClick={handleClearMessages} disabled={!activeChat?.id}>
                        Clear Messages
                      </Button>
                    </ButtonTooltip>
                  </div>
                </Card.Header>
                <div className="flex-grow-1" style={{ minHeight: 0 }}>
                  <SimpleBar style={{ height: "100%", maxHeight: "100%" }}>
                    <Card.Body className="h-100">
                      {messages.length === 0 ? (
                        <div className="text-center text-muted mt-5">
                          {activeChat?.id ? "Start the conversation..." : "Select or create a chat"}
                        </div>
                      ) : (
                        messages.map((msg, index) => {
                          const hasMessageId = Boolean(
                            msg?.id && !String(msg.id).startsWith("draft-")
                          );
                          const messageKey = msg.id || index;
                          const showMessageActions = hoveredMessageKey === messageKey;

                          return (
                            <div
                              key={messageKey}
                              className={`d-flex mb-3 ${msg.role === "user" ? "justify-content-end" : "justify-content-start"}`}
                              onMouseEnter={() => setHoveredMessageKey(messageKey)}
                              onMouseLeave={() =>
                                setHoveredMessageKey((prev) => (prev === messageKey ? null : prev))
                              }
                            >
                              <div
                                className={`p-3 rounded-3 shadow-sm ${msg.role === "user" ? "bg-soft-primary" : "bg-light"}`}
                                style={{ maxWidth: "75%" }}
                              >
                                
                              {msg.role === "assistant" ? (
                                <ReactMarkdown
                                  components={{
                                    code({ inline, className, children, ...props }) {
                                      const codeText = String(children || "").replace(/\n$/, "");
                                      const lang = className?.replace("language-", "") || "code";
                                      const codeKey = `${lang}-${codeText.slice(0, 36)}-${codeText.length}`;

                                      if (inline) {
                                        return (
                                          <code className="px-1 rounded bg-light border" {...props}>
                                            {children}
                                          </code>
                                        );
                                      }

                                      return (
                                        <div className="border rounded-3 overflow-hidden shadow-sm my-2">
                                          <div className="d-flex justify-content-between align-items-center px-3 py-2 bg-light border-bottom">
                                            <small className="text-muted text-uppercase fw-semibold">{lang}</small>
                                            <ButtonTooltip id={`tt-copy-${lang}-${codeText.length}`} title="Copy code block">
                                              <Button
                                                size="sm"
                                                variant="light"
                                                className="border d-flex align-items-center gap-1"
                                                onClick={() => handleCopyCode(codeText, codeKey)}
                                              >
                                                {copiedCodeKey === codeKey ? (
                                                  <i className="ri-check-line text-success" />
                                                ) : (
                                                  <i className="ri-file-copy-line" />
                                                )}
                                              </Button>
                                            </ButtonTooltip>
                                          </div>

                                          <pre className="m-0 p-3 bg-dark text-light" style={{ overflowX: "auto" }}>
                                            <code>{codeText}</code>
                                          </pre>
                                        </div>
                                      );
                                    },
                                  }}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                              ) : (
                                msg.content
                              )}
                              {sending && msg.id === draftAssistantIdRef.current && (
                                <span className="ms-1 fw-bold text-muted">{blinkOn ? "|" : " "}</span>
                              )}
                              </div>

                              {/*  Only show message actions if the message has been persisted and has a valid ID. */}
                              {hasMessageId && (
                                  <div
                                    className="d-flex justify-content-end mb-2 ms-2"
                                    style={{
                                      opacity: showMessageActions ? 1 : 0,
                                      pointerEvents: showMessageActions ? "auto" : "none",
                                      transition: "opacity 0.15s ease-in-out",
                                    }}
                                  >
                                    <Dropdown align="end" drop="end">
                                      <ButtonTooltip id={`tt-message-actions-${msg.id || index}`} title="Open message actions">
                                        <Dropdown.Toggle
                                          as="button"
                                          className="btn btn-sm p-0 border-0 bg-transparent shadow-none chat-more-toggle"
                                        >
                                          <i className="ri-more-2-fill fs-4" />
                                        </Dropdown.Toggle>
                                      </ButtonTooltip>
                                      <Dropdown.Menu className="shadow-sm border-0 py-2">
                                        {msg.role === "assistant" && (
                                          <Dropdown.Item onClick={() => handleRegenerateMessage(msg.id)}>
                                            <i className="ri-refresh-line me-2 text-muted" />
                                            Regenerate
                                          </Dropdown.Item>
                                        )}
                                        <Dropdown.Item onClick={() => handleViewMetadata(msg.id)}>
                                          <i className="ri-information-line me-2 text-muted" />
                                          View Metadata
                                        </Dropdown.Item>
                                        <Dropdown.Item onClick={() => handleSaveMetadata(msg.id)}>
                                          <i className="ri-save-line me-2 text-muted" />
                                          Save Metadata
                                        </Dropdown.Item>
                                        <Dropdown.Divider />
                                        <Dropdown.Item className="text-danger" onClick={() => handleDeleteMessage(msg.id)}>
                                          <i className="ri-delete-bin-line me-2" />
                                          Delete Message
                                        </Dropdown.Item>
                                      </Dropdown.Menu>
                                    </Dropdown>
                                  </div>
                                )}
                            </div>
                          );
                        })
                      )}

                      {sending && (
                        <div className="text-muted small">
                          <Spinner animation="border" size="sm" className="me-2" />
                          AI is typing...
                        </div>
                      )}

                      <div ref={bottomRef} />
                    </Card.Body>
                  </SimpleBar>
                </div>

                <Card.Footer className="bg-white">
                  <Form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                  >
                    <InputGroup>
                      <Form.Control
                        type="text"
                        placeholder="Type your message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={!activeChat?.id || sending}
                        aria-label="Message input"
                      />
                      <ButtonTooltip id="tt-send" title="Send message to assistant">
                        <Button type="submit" variant="primary" disabled={!activeChat?.id || sending}>
                          Send
                        </Button>
                      </ButtonTooltip>
                      {sending && (
                        <ButtonTooltip id="tt-stop" title="Stop generating response">
                          <Button variant="outline-secondary" onClick={() => streamControllerRef.current?.abort()}>
                            Stop
                          </Button>
                        </ButtonTooltip>
                      )}
                    </InputGroup>
                  </Form>
                </Card.Footer>
              </Card>
            </Col>
          </Row>
        </>
      )
      }
      {/* // Modals for adding/removing participants from the current chat session. */}
      <AddParticipantModal
        show={showAddParticipantModal}
        onHide={() => {
          if (addingParticipant) return;
          setShowAddParticipantModal(false);
          reset({ user_id: null });
        }}
        handleSubmit={handleSubmit}
        onSubmit={handleAddParticipantSubmit}
        control={control}
        register={register}
        errors={errors}
        touchedFields={touchedFields}
        fields={addParticipantFields}
        adding={addingParticipant}
        reset={reset}
      />
      <RemoveParticipantModal
        show={showRemoveParticipantModal}
        onHide={() => {
          if (removingParticipant) return;
          setShowRemoveParticipantModal(false);
          resetRemove({ user_id: null });
        }}
        handleSubmit={handleRemoveSubmit}
        onSubmit={handleRemoveParticipantSubmit}
        control={removeControl}
        register={removeRegister}
        errors={removeErrors}
        touchedFields={removeTouchedFields}
        fields={removeParticipantFields}
        removing={removingParticipant}
        reset={resetRemove}
      />
    </LayoutWrapper>
  );
};

export default Chatbot;
