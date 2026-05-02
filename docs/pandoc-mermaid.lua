function CodeBlock(block)
  for _, class in ipairs(block.classes) do
    if class == "mermaid" then
      return pandoc.RawBlock("html", '<pre class="mermaid">' .. block.text .. '</pre>')
    end
  end
  return nil
end
