async function main()
{
    const adapter = await navigator.gpu?.requestAdapter()
    const device = await adapter?.requestDevice()
    if(!device)
    {
        fail('need a browser that supports WebGPU')
    }

    const canvas = document.querySelector('.WebGPUJourney')
    const context = canvas.getContext('webgpu')
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat()
    context.configure({
        device,
        format: presentationFormat
    })

    const module = device.createShaderModule({
        label: 'our hardcoded rgb triangle shaders',
        code: `
        
            struct OurStruct
            {
                color : vec4f,
                scale : vec2f,
                offset : vec2f
            };
        
            struct OurVertexShaderOutput
            {
                @builtin(position) position : vec4f,
                @location(0) color : vec4f
            };
        
            @group(0) @binding(0) var<uniform> ourStruct : OurStruct;
        
            @vertex fn vs(
                @builtin(vertex_index) vertexIndex : u32
            ) -> OurVertexShaderOutput
            {
                let pos = array(
                    vec2f(0.0, 0.5),
                    vec2f(-0.5, -0.5),
                    vec2f(0.5, -0.5)
                );
                
                var color = array<vec4f, 3>(
                    vec4f(1, 0, 0, 1),
                    vec4f(0, 1, 0, 1),
                    vec4f(0, 0, 1, 1)
                );
                
                var vsOutput : OurVertexShaderOutput;
                vsOutput.position = vec4f(pos[vertexIndex] * ourStruct.scale + ourStruct.offset, 0.0, 1.0);
                vsOutput.color = ourStruct.color;
                
                return vsOutput;
            }
            
            @fragment fn fs(fsInput : OurVertexShaderOutput) -> @location(0) vec4f
            {
                return fsInput.color;
                
                let red = vec4f(1, 0, 0, 1);
                let cyan = vec4f(0, 1, 1, 1);
                
                let grid = vec2u(fsInput.position.xy) / 8;
                let checker = (grid.x + grid.y) % 2 == 1;
                
                return select(red, cyan, checker);
            }
        `
    })

    const pipeline = device.createRenderPipeline({
        label: 'our hardcoded red triangle pipeline',
        layout: 'auto',
        vertex: {
            entryPoint: 'vs',
            module
        },
        fragment: {
            entryPoint: 'fs',
            module,
            targets: [{ format: presentationFormat }]
        }
    })

    const rand = (min, max) => {
        if(min === undefined) {
            min = 0
            max = 1
        }
        else if(max === undefined) {
            max = min
            min = 0
        }
        return min + Math.random() * (max - min)
    }

    const uniformBufferSize =
        4 * 4 +
        2 * 4 +
        2 * 4
    const uniformBuffer = device.createBuffer({
        size : uniformBufferSize,
        usage : GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    const uniformValues = new Float32Array(uniformBufferSize / 4)
    const kColorOffset = 0
    const kScaleOffset = 4
    const kOffsetOffset = 6

    const kNumObjects = 100
    const objectInfos = []

    for(let i = 0; i < kNumObjects; ++i)
    {
        const uniformBuffer = device.createBuffer({
            label : `uniforms for obj: ${i}`,
            size : uniformBufferSize,
            usage : GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        uniformValues.set([rand(), rand(), rand(), 1], kColorOffset)
        uniformValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], kOffsetOffset)

        const bindGroup = device.createBindGroup({
            label: `bind group for obj: ${i}`,
            layout : pipeline.getBindGroupLayout(0),
            entries : [
                { binding : 0, resource : { buffer : uniformBuffer }}
            ]
        })

        objectInfos.push({
            scale: rand(0.2, 0.5),
            uniformBuffer,
            uniformValues,
            bindGroup,
        });
    }

    const renderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [{
            clearValue: [0.3, 0.3, 0.3, 1],
            loadOp: 'clear',
            storeOp: 'store'
        }]
    }

    function render()
    {
        renderPassDescriptor.colorAttachments[0].view =
            context.getCurrentTexture().createView()

        const encoder = device.createCommandEncoder({
            label: 'our encoder'
        })

        const pass = encoder.beginRenderPass(renderPassDescriptor)
        pass.setPipeline(pipeline)

        const aspect = canvas.width / canvas.height;

        for(const {scale, bindGroup, uniformBuffer, uniformValues} of objectInfos)
        {
            uniformValues.set([scale / aspect, scale], kScaleOffset)
            device.queue.writeBuffer(uniformBuffer, 0, uniformValues)

            pass.setBindGroup(0, bindGroup)
            pass.draw(3)
        }
        pass.end()

        const commandBuffer = encoder.finish()
        device.queue.submit([commandBuffer])
    }

    const observer = new ResizeObserver(entries => {
        for(const entry of entries)
        {
            const canvas = entry.target
            const width = entry.contentBoxSize[0].inlineSize
            const height = entry.contentBoxSize[0].blockSize
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D))
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D))

            render()
        }
    })
    observer.observe(canvas)
}

main()



