This file is shared between the client and server, it contains two files

### shared.ts
Contains interfaces that are common between client and server, such as the packets they use to communicate, the serialized vector, teams, and other misc game data

### rpc.ts
This is where the RPC class that everything uses to communicate, **whenever importing this make sure to include the .js in the path**

## Building
- Run `npm i --include=dev`
- Run `tsc -w`

There is no way to directly run this as its meant to be used/included in the other projects

## RPC
RPC allows for remote method calls, the C# version is slightly different (it is not bi-directional) and as such specific documentation can be found there

For RPC to work, the class names, and method names must be identical on both the sender and the receiver.

To enable RPC on a class it must be decorated with the `@EnableRPCs` decorator, and then the method must have the `@RPC` decorator.

```ts
@EnableRPCs("instance")
class Sync {
	constructor(private id: string) {}

	@RPC("in")
	hello() {
		console.log("Hello World")
	}
}
```

### Decorators

The `@EnableRPCs` decorator has the following options:

- `static` All RPC methods on the class will be static
- `singleInstance` The methods on the class will be non-static, however only one instance of the class will ever exist (if you create multiple, it will overwrite the previous methods RPC handlers)
- `instance` A class decorated with this *must* have an `id` property used to uniquely identify the class, instanced classes can have any number of instances and the `id` property will be used to reference the specific class

The `@RPC` decorator has the following options:

- `in` The RPC is a handler that will get called as a remote sync, user code can go in here
- `out` This RPC will be transmitted to the receiver, no code should be within the body (it will not be executed)

### Setup

To setup the RPC system you must first call `RPCController.init` with a valid "send handler" 

`sendHandler: (packet: RPCPacket) => void`

The send handler is used to transmit RPC packets to receivers. Additionally, whenever you receive a RPC packet you must call `RPCController.handlePacket`

### Deregistering
If you have a RPC class that you would like to stop receiving messages, you can call deregister. `RPCController.deregister(instance)`