"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChatPage } from "@/components/chat/chat-page";

function ChatRoute() {
  const searchParams = useSearchParams();

  const productParam = searchParams.get("product");
  const orderParam = searchParams.get("order");
  const producerParam = searchParams.get("producer");
  const producerUserParam = searchParams.get("producerUser");

  return (
    <ChatPage
      initialProductId={productParam}
      initialOrderId={orderParam}
      initialProducerId={producerParam}
      initialProducerUserId={producerUserParam}
    />
  );
}

export default function Chat() {
  return (
    <Suspense fallback={<div className="page-container text-center text-gray-500">Loading...</div>}>
      <ChatRoute />
    </Suspense>
  );
}