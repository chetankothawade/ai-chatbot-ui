import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import {
    Row,
    Col,
    Card,
    Form
} from "react-bootstrap";

import LayoutWrapper from "../components/LayoutWrapper";

import { SkeletonLayout, SkeletonTableList } from "../../../components/Skeleton";


// Service
import chatbotService from "../../../services/chatbotService";

const Chatbot = () => {

    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    const [chats, setChats] = useState([]);
    const [messages, setMessages] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [input, setInput] = useState("");

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

        const candidates = [
            payload?.messages,
            payload?.data?.messages,
            payload?.data,
        ];

        return candidates.find(Array.isArray) || [];
    };

    //Load Chat List
    const loadChats = useCallback(async () => {
        setLoading(true);
        try {
            const response = await chatbotService.listSessions();
            const payload = response?.data;
            setChats(normalizeChats(payload));
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load chats");
            setChats([]);
        } finally {
            setLoading(false);
        }
    }, []);

    //Load Chat Messages
    const loadChat = async (chatId) => {
        setActiveChat({ id: chatId });

        try {
            const response = await chatbotService.getSession(chatId);
            const payload = response?.data;
            setMessages(normalizeMessages(payload));
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to load chat messages");
            setMessages([]);
        }
    };


    //Send Message // Simple send message function without streaming response handling for simplicity. You can enhance it to handle streaming if your backend supports it.
    const sendMessage = async () => {
        if (!input.trim() || !activeChat?.id) return;

        const userMsg = { role: "user", content: input };
        setMessages(prev => [...prev, userMsg]);
        setSending(true);

        try {
            const response = await chatbotService.sendMessage({
                chat_id: activeChat?.id,
                message: input
            });
            const payload = response?.data;
            const assistantMessage = payload?.assistant_message || payload?.data?.assistant_message;

            if (assistantMessage) {
                setMessages(prev => [...prev, assistantMessage]);
            }
            setInput("");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to send message");
        } finally {
            setSending(false);
        }
    };

    //Create New Chat
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

    //Load Initial Data
    useEffect(() => {
        loadChats();
    }, [loadChats]);


    //Auto Scroll
    const bottomRef = useRef();

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);


    /* =========================================================
       RENDER UI
    ========================================================= */
    return (
        <LayoutWrapper>
            {loading ? (
                <SkeletonLayout headerActions>
                    <SkeletonTableList rows={10} columns={3} />
                </SkeletonLayout>
            ) : (
                <>
                    {/* Header */}
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

                    {/* Search */}
                    <Row>
                        <Col>
                            <Card className="shadow-sm">
                                <Card.Header className="border-0">

                                </Card.Header>

                                <Row>
                                    {/* Sidebar */}
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
                                                    chats.map(chat => (
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

                                    {/* Chat Window */}
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
                                                            key={index}
                                                            className={`d-flex mb-2 ${msg.role === "user" ? "justify-content-end" : "justify-content-start"}`}
                                                        >
                                                            <div
                                                                className={`p-2 rounded ${msg.role === "user" ? "bg-primary text-white" : "bg-light"}`}
                                                                style={{ maxWidth: "70%" }}
                                                            >
                                                                {msg.content}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                                {sending && <div className="text-muted small mt-2">AI is typing...</div>}
                                                <div ref={bottomRef} />
                                            </Card.Body>

                                            {/* Input */}
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
