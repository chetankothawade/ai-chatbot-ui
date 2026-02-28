import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";

import { Row, Col, Card, Form } from "react-bootstrap";

import LayoutWrapper from "../components/LayoutWrapper";
import { SkeletonLayout, SkeletonTableList } from "../../../components/Skeleton";

import chatbotService from "../../../services/chatbotService";

const Chatbot = () => {
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    const [chats, setChats] = useState([]);
    const [messages, setMessages] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [input, setInput] = useState("");

    const bottomRef = useRef(null);
    const streamControllerRef = useRef(null);

    const normalizeChats = (payload) => {
        if (Array.isArray(payload)) return payload;

        const candidates = [
            payload?.data,
            payload?.data?.data,
            payload?.data?.sessions,
            payload?.sessions,
            payload?.results,
        ];

        return candidates.find(Array.isArray) || [];
    };

    const normalizeMessages = (payload) => {
        if (Array.isArray(payload)) return payload;

        const candidates = [payload?.messages, payload?.data?.messages, payload?.data];
        return candidates.find(Array.isArray) || [];
    };

    const tokenizeCode = (code, language) => {
        const lang = String(language || "").toLowerCase();
        const highlightable = ["js", "jsx", "ts", "tsx", "javascript", "typescript", "json"].includes(lang);

        if (!highlightable) return [{ type: "plain", value: code }];

        const tokenRegex =
            /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|async|await|import|from|export|default|class|new|try|catch|throw)\b|\b\d+(?:\.\d+)?\b)/g;
        const parts = code.split(tokenRegex);

        return parts.map((part) => {
            if (!part) return { type: "plain", value: "" };
            if (/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)$/.test(part)) return { type: "string", value: part };
            if (/^\b\d+(?:\.\d+)?\b$/.test(part)) return { type: "number", value: part };
            if (/^\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|async|await|import|from|export|default|class|new|try|catch|throw)\b$/.test(part)) {
                return { type: "keyword", value: part };
            }
            return { type: "plain", value: part };
        });
    };

    const loadChats = useCallback(async () => {
        setLoading(true);
        try {
            const response = await chatbotService.listSessions();
            setChats(normalizeChats(response?.data));
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load chats");
            setChats([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadChat = async (chatId) => {
        setActiveChat({ id: chatId });

        try {
            const response = await chatbotService.getSession(chatId);
            setMessages(normalizeMessages(response?.data));
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load chat messages");
            setMessages([]);
        }
    };

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

        const controller = new AbortController();
        streamControllerRef.current = controller;

        try {
            await chatbotService.streamMessage({
                chatId: activeChat.id,
                message: currentInput,
                signal: controller.signal,
                onChunk: (chunk) => {
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === draftAssistantId ? { ...msg, content: `${msg.content || ""}${chunk}` } : msg
                        )
                    );
                },
            });

            loadChats();
        } catch (error) {
            if (error?.name !== "CanceledError" && error?.name !== "AbortError") {
                toast.error(error.response?.data?.message || "Streaming failed");
            }
        } finally {
            streamControllerRef.current = null;
            setSending(false);
        }
    };

    const handleStopStream = () => {
        streamControllerRef.current?.abort();
    };

    const handleNewChat = async () => {
        try {
            const response = await chatbotService.createSession();
            const payload = response?.data;
            const nextChat = payload?.data || payload;

            setActiveChat(nextChat || null);
            setMessages([]);
            loadChats();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to create a new chat");
        }
    };

    useEffect(() => {
        loadChats();
    }, [loadChats]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <LayoutWrapper>
            {loading ? (
                <SkeletonLayout headerActions>
                    <SkeletonTableList rows={10} columns={3} />
                </SkeletonLayout>
            ) : (
                <>
                    <Row>
                        <Col>
                            <div className="page-title-box d-flex align-items-center justify-content-between">
                                <h4 className="mb-0">Chatbot</h4>

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

                    <Row>
                        <Col>
                            <Card className="shadow-sm">
                                <Card.Header className="border-0" />

                                <Row>
                                    <Col md={3}>
                                        <Card className="h-100">
                                            <Card.Header className="d-flex justify-content-between">
                                                <strong>Chats</strong>
                                                <button className="btn btn-sm btn-primary" onClick={handleNewChat}>
                                                    + New
                                                </button>
                                            </Card.Header>

                                            <Card.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
                                                {chats.length === 0 ? (
                                                    <div className="text-muted small">No chats found.</div>
                                                ) : (
                                                    chats.map((chat) => (
                                                        <div
                                                            key={chat.id}
                                                            className={`p-2 mb-2 rounded ${activeChat?.id === chat.id ? "bg-light" : ""}`}
                                                            style={{ cursor: "pointer" }}
                                                            onClick={() => loadChat(chat.id)}
                                                        >
                                                            {chat.title || `Chat #${chat.id}`}
                                                        </div>
                                                    ))
                                                )}
                                            </Card.Body>
                                        </Card>
                                    </Col>

                                    <Col md={9}>
                                        <Card className="h-100 d-flex flex-column">
                                            <Card.Body style={{ height: "60vh", overflowY: "auto" }}>
                                                {messages.length === 0 ? (
                                                    <div className="text-muted">
                                                        {activeChat?.id ? "No messages yet." : "Select a chat to start messaging."}
                                                    </div>
                                                ) : (
                                                    messages.map((msg, index) => (
                                                        <div
                                                            key={msg.id || `${msg.role}-${index}`}
                                                            className={`d-flex mb-2 ${msg.role === "user" ? "justify-content-end" : "justify-content-start"}`}
                                                        >
                                                            <div
                                                                className={`p-2 rounded ${msg.role === "user" ? "bg-primary text-white" : "bg-light"}`}
                                                                style={{ maxWidth: "70%" }}
                                                            >
                                                                {msg.role === "assistant" ? (
                                                                    <ReactMarkdown
                                                                        components={{
                                                                            code({ inline, className, children, ...props }) {
                                                                                const language = (className || "").replace("language-", "").toLowerCase();
                                                                                const rawCode = String(children || "").replace(/\n$/, "");

                                                                                if (inline) {
                                                                                    return (
                                                                                        <code
                                                                                            className="px-1 rounded"
                                                                                            style={{ background: "#e9ecef", color: "#d63384" }}
                                                                                            {...props}
                                                                                        >
                                                                                            {children}
                                                                                        </code>
                                                                                    );
                                                                                }

                                                                                const tokens = tokenizeCode(rawCode, language);
                                                                                return (
                                                                                    <div
                                                                                        className="rounded border overflow-hidden my-2"
                                                                                        style={{ background: "#0f172a", borderColor: "#1f2937" }}
                                                                                    >
                                                                                        <div
                                                                                            className="px-2 py-1 small text-uppercase fw-semibold"
                                                                                            style={{ background: "#111827", color: "#93c5fd" }}
                                                                                        >
                                                                                            {language || "code"}
                                                                                        </div>
                                                                                        <pre className="m-0 p-3" style={{ overflowX: "auto" }}>
                                                                                            <code style={{ color: "#e5e7eb", whiteSpace: "pre" }} {...props}>
                                                                                                {tokens.map((token, i) => {
                                                                                                    if (token.type === "keyword") return <span key={i} style={{ color: "#93c5fd" }}>{token.value}</span>;
                                                                                                    if (token.type === "string") return <span key={i} style={{ color: "#86efac" }}>{token.value}</span>;
                                                                                                    if (token.type === "number") return <span key={i} style={{ color: "#fcd34d" }}>{token.value}</span>;
                                                                                                    return <span key={i}>{token.value}</span>;
                                                                                                })}
                                                                                            </code>
                                                                                        </pre>
                                                                                    </div>
                                                                                );
                                                                            },
                                                                        }}
                                                                    >
                                                                        {msg.content || ""}
                                                                    </ReactMarkdown>
                                                                ) : (
                                                                    msg.content
                                                                )}
                                                                {msg.role === "assistant" && sending && index === messages.length - 1 && " |"}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                                {sending && <div className="text-muted small mt-2">AI is typing...</div>}
                                                <div ref={bottomRef} />
                                            </Card.Body>

                                            <Card.Footer>
                                                <Form
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        sendMessage();
                                                    }}
                                                >
                                                    <div className="d-flex">
                                                        <Form.Control
                                                            type="text"
                                                            placeholder="Type your message..."
                                                            value={input}
                                                            onChange={(e) => setInput(e.target.value)}
                                                            disabled={!activeChat?.id || sending}
                                                        />
                                                        <button className="btn btn-primary ms-2" disabled={!activeChat?.id || sending}>
                                                            Send
                                                        </button>
                                                        {sending && (
                                                            <button type="button" className="btn btn-outline-secondary ms-2" onClick={handleStopStream}>
                                                                Stop
                                                            </button>
                                                        )}
                                                    </div>
                                                </Form>
                                            </Card.Footer>
                                        </Card>
                                    </Col>
                                </Row>
                            </Card>
                        </Col>
                    </Row>
                </>
            )}
        </LayoutWrapper>
    );
};

export default Chatbot;
