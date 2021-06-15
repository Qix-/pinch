import * as acorn from 'acorn';

const mkenum = (...consts) => consts.reduce((obj, n, i) => { obj[n] = i; return obj }, {consts});

const I = mkenum(
	'END',
	'CALL',
	'NEW',
	'FN_EXPR',
	'FN',
	'BLOCK',
	'LOOKUP',
	'IF',
	'IFE',
	'LOG_AND',
	'LOG_OR',
	'BIN_EQEQEQ',
	'BIN_EQEQ',
	'BIN_NEQEQEQ',
	'BIN_NEQEQ',
	'BIN_LT',
	'BIN_GT',
	'BIN_LTE',
	'BIN_GTE',
	'BIN_PLUS',
	'BIN_MINUS',
	'BIN_MULT',
	'BIN_DIV',
	'BIN_MOD',
	'BIN_IN',
	'BIN_BAND',
	'BIN_BOR',
	'BIN_BXOR',
	'BIN_LSHIFT',
	'BIN_RSHIFT',
	'BIN_INSTANCEOF',
	'UN_TYPEOF',
	'UN_NEGATE',
	'UN_VOID',
	'UN_DELETE',
	'UN_INVERSE',
	'UN_BNOT',
	'MEMBER',
	'MEMBER_OPT',
	'MEMBER_OPT_COMP',
	'MEMBER_COMP',
	'ARRAY',
	'SEQUENCE', // comma expression
	'ASS',
	'ASS_PLUS',
	'ASS_MINUS',
	'ASS_MULT',
	'ASS_DIV',
	'ASS_MOD',
	'ASS_BAND',
	'ASS_BOR',
	'ASS_BXOR',
	'ASS_LSHIFT',
	'ASS_RSHIFT',
	'OBJECT',
	'THIS',
	'FOR_ITU',
	'FOR_TU',
	'FOR_IU',
	'FOR_IT',
	'FOR_I',
	'FOR_T',
	'FOR_U',
	'FOR',
	'FOR_IN',
	'EMPTY',
	'VAR',
	'VAR_INIT',
	'VAR_MULTI',
	'LET',
	'LET_INIT',
	'LET_MULTI',
	'CONST',
	'CONST_INIT',
	'CONST_MULTI',
	'POST_INC',
	'PRE_INC',
	'POST_DEC',
	'PRE_DEC',
	'RETURN',
	'RETURN_EXPR',
	'TERNARY',
	'SWITCH',
	'DEFAULT',
	'TRY_C',
	'TRY_F',
	'TRY_CF',
	'THROW',
	'DO',
	'BREAK',
	'BREAK_LABEL',
	'LABEL',
	'CONTINUE',
	'CONTINUE_LABEL'
);

if (I.consts.length >= 128) {
	throw new Error('can\'t have more than 128 commands, otherwise inline RLE can\'t be implemented!');
}

function* encodeInt(n, Z = 0, M = 127, H = 0x80, S = 7) {
	if (n === Z) {
		yield Number(Z);
	} else {
		while (n) {
			let i = n & M;
			n >>= S;
			if (n) i |= H;
			yield Number(i);
		}
	}
}

function* encodeBigInt(n) {
	yield* encodeInt(n, 0n, 127n, 0x80n, 7n);
}

class Walker {
	constructor() {
		this.lookups = new Map();
	}

	*lookup(v) {
		if (typeof v !== 'string') {
			throw new Error(`can only lookup strings (got ${typeof v}: ${v})`);
		}

		let id = this.lookups.get(v);

		if (id === undefined) {
			id = this.lookups.size;
			this.lookups.set(v, id);
		}

		yield* encodeInt(id);
	}

	*traverse(n) {
		if (Array.isArray(n)) {
			for (const x of n) {
				yield* this.traverse(x);
			}
		} else if (n.type in this) {
			yield* this[n.type](n);
		} else {
			throw new Error(`unknown AST node type: ${n.type} (at ${JSON.stringify(n.loc)})`);
		}
	}

	*Program(n) {
		for (const node of n.body) {
			yield* this.traverse(node);
		}
	}

	*ExpressionStatement(n) {
		yield* this.traverse(n.expression);
	}

	*CallExpression(n, code=I.CALL) {
		yield code;
		yield* this.traverse(n.callee);
		yield* this.traverse(n.arguments);
		yield I.END;
	}

	*FunctionExpression(n, code=I.FN_EXPR) {
		let flagByte = 0;
		if (n.id)         flagByte |= (1<<0);
		if (n.expression) flagByte |= (1<<1);
		if (n.generator)  flagByte |= (1<<2);
		if (n.async)      flagByte |= (1<<3);

		// If the upper nibble is 0 then check for
		// END after params, else subtract and use
		// that as the param count.
		if (n.params.length < 15) {
			flagByte |= (n.params.length + 1) << 4;
		}

		yield code;
		yield flagByte;

		yield* this.traverse(n.params);
		if (n.params.length >= 15) yield I.END;
		yield* this.traverse(n.body);
	}

	*BlockStatement(n) {
		yield I.BLOCK;
		yield* this.traverse(n.body);
		yield I.END;
	}

	*Literal(n) {
		yield I.LOOKUP;
		yield* this.lookup(n.raw);
	}

	*Identifier(n) {
		yield I.LOOKUP;
		yield* this.lookup(n.name);
	}

	*ConditionalExpression(n) {
		yield I.TERNARY;
		yield* this.traverse(n.test);
		yield* this.traverse(n.consequent);
		yield* this.traverse(n.alternate);
	}

	*LogicalExpression(n) {
		switch (n.operator) {
			case '&&': yield I.LOG_AND; break;
			case '||': yield I.LOG_OR; break;
			default: throw new Error(`unknown logical operator: ${n.operator} (at ${JSON.stringify(n.loc)})`);
		}

		yield* this.traverse(n.left);
		yield* this.traverse(n.right);
	}

	*BinaryExpression(n) {
		switch (n.operator) {
			case '===': yield I.BIN_EQEQEQ; break;
			case '==': yield I.BIN_EQEQ; break;
			case '!==': yield I.BIN_NEQEQEQ; break;
			case '!=': yield I.BIN_NEQEQ; break;
			case '<': yield I.BIN_LT; break;
			case '<=': yield I.BIN_LTE; break;
			case '>': yield I.BIN_GT; break;
			case '>=': yield I.BIN_GTE; break;
			case '+': yield I.BIN_PLUS; break;
			case '-': yield I.BIN_MINUS; break;
			case '*': yield I.BIN_MULT; break;
			case '/': yield I.BIN_DIV; break;
			case '%': yield I.BIN_MOD; break;
			case 'in': yield I.BIN_IN; break;
			case '&': yield I.BIN_BAND; break;
			case '|': yield I.BIN_BOR; break;
			case '^': yield I.BIN_BXOR; break;
			case '<<': yield I.BIN_LSHIFT; break;
			case '>>': yield I.BIN_RSHIFT; break;
			case 'instanceof': yield I.BIN_INSTANCEOF; break;
			default: throw new Error(`unknown binary operator: ${n.operator} (at ${JSON.stringify(n.loc)})`);
		}

		yield* this.traverse(n.left);
		yield* this.traverse(n.right);
	}

	*UnaryExpression(n) {
		switch (n.operator) {
			case 'typeof': yield I.UN_TYPEOF; break;
			case '!': yield I.UN_NEGATE; break;
			case 'void': yield I.UN_VOID; break;
			case 'delete': yield I.UN_DELETE; break;
			case '-': yield I.UN_INVERSE; break;
			case '~': yield I.UN_BNOT; break;
			default: throw new Error(`unknown unary operator: ${n.operator} (at ${JSON.stringify(n.loc)})`);
		}

		yield* this.traverse(n.argument);
	}

	*MemberExpression(n) {
		yield (
			n.computed
				? n.optional
					? I.MEMBER_OPT_COMP
					: I.MEMBER_COMP
				: n.optional
					? I.MEMBER_OPT
					: I.MEMBER
		);

		yield* this.traverse(n.object);
		yield* this.traverse(n.property);
	}

	*ArrayExpression(n) {
		yield I.ARRAY;
		yield* this.traverse(n.elements);
		yield I.END;
	}

	*SequenceExpression(n) {
		yield I.SEQUENCE;
		yield* this.traverse(n.expressions);
		yield I.END;
	}

	*AssignmentExpression(n) {
		switch (n.operator) {
			case '=': yield I.ASS; break;
			case '+=': yield I.ASS_PLUS; break;
			case '-=': yield I.ASS_MINUS; break;
			case '*=': yield I.ASS_MULT; break;
			case '/=': yield I.ASS_DIV; break;
			case '%=': yield I.ASS_MOD; break;
			case '&=': yield I.ASS_BAND; break;
			case '|=': yield I.ASS_BOR; break;
			case '^=': yield I.ASS_BXOR; break;
			case '<<=': yield I.ASS_LSHIFT; break;
			case '>>=': yield I.ASS_RSHIFT; break;
			default: throw new Error(`unknown assignment operator: ${n.operator} (at ${JSON.stringify(n.loc)})`);
		}

		yield* this.traverse(n.left);
		yield* this.traverse(n.right);
	}

	*ObjectExpression(n) {
		yield I.OBJECT;

		/*
			0:123
			1:12

			0: property mode
				1: computed?
				2: method?
				3: shorthand?
			1: getter/setter mode
				1: computed?
				2: getter=0 setter=1
		*/
		let bitFlags = 0n;
		for (let i = (n.properties.length - 1); i >= 0; i--) {
			const prop = n.properties[i];

			if (prop.kind === 'init') {
				bitFlags <<= 4n;
				if (prop.computed)  bitFlags |= (1n<<2n);
				if (prop.method)    bitFlags |= (1n<<1n);
				if (prop.shorthand) bitFlags |= (1n<<0n);
			} else {
				bitFlags <<= 3n;
				bitFlags |= (1n<<2n);

				if (prop.computed) bitFlags |= (1n<<1n);

				if (prop.kind === 'set') {
					bitFlags |= (1n<<0n);
				} else if (prop.kind !== 'get') {
					throw new Error(`unknown object property kind: ${prop.kind} (at ${JSON.stringify(n.loc)})`);
				}
			}
		}

		yield* encodeBigInt(bitFlags);

		for (const prop of n.properties) {
			if (prop.computed) {
				yield* this.traverse(prop.key);
			} else {
				// XXX This is weird, should probably handle this better.
				// XXX I did this since it might either be an Identifier or a Literal.
				yield* this.lookup(prop.key.raw ?? prop.key.name);
			}

			if (!prop.shorthand) {
				yield* this.traverse(prop.value);
			}
		}

		yield I.END;
	}

	*ThisExpression(n) {
		yield I.THIS;
	}

	*FunctionDeclaration(n) {
		yield* this.FunctionExpression(n, I.FN);
	}

	*ForStatement(n) {
		// sorry :c
		yield (
			n.init
				? n.test
					? n.update
						? I.FOR_ITU
						: I.FOR_IT
					: n.update
						? I.FOR_IU
						: I.FOR_I
				: n.test
					? n.update
						? I.FOR_TU
						: I.FOR_T
					: n.update
						? I.FOR_U
						: I.FOR
		);

		if (n.init) yield* this.traverse(n.init);
		if (n.test) yield* this.traverse(n.test);
		if (n.update) yield* this.traverse(n.update);
		yield* this.traverse(n.body);
	}

	*EmptyStatement(n) {
		yield I.EMPTY;
	}

	*VariableDeclaration(n) {
		let selection;

		switch (n.kind) {
			case 'var':
				selection = [I.VAR_MULTI, I.VAR_INIT, I.VAR];
				break;
			case 'let':
				selection = [I.LET_MULTI, I.LET_INIT, I.LET];
				break;
			case 'const':
				selection = [I.CONST_MULTI, I.CONST_INIT, I.CONST];
				break;
			default:
				throw new Error(`unknown variable declaration kind: ${n.kind} (at ${JSON.stringify(n.loc)})`);
		}

		yield (
			n.declarations.length > 1
				? selection[0]
				: n.declarations[0].init
					? selection[1]
					: selection[2]
		);

		if (n.declarations.length === 1) {
			yield* this.lookup(n.declarations[0].id.name);
			if (n.declarations[0].init) yield* this.traverse(n.declarations[0].init);
		} else {
			let initBits = 0n;
			for (let i = (n.declarations.length - 1); i >= 0; i--) {
				initBits <<= 1n;
				initBits |= BigInt(Boolean(n.declarations[i].init));
			}

			yield* encodeBigInt(initBits);

			for (const decl of n.declarations) {
				yield* this.lookup(decl.id.name);
				if (decl.init) yield* this.traverse(decl.init);
			}

			yield I.END;
		}
	}

	*UpdateExpression(n) {
		switch (n.operator) {
			case '++':
				yield n.prefix ? I.PRE_INC : I.POST_INC;
				break;
			case '--':
				yield n.prefix ? I.PRE_DEC : I.POST_DEC;
				break;
			default:
				throw new Error(`unknown update operator: ${n.operator} (at ${JSON.stringify(n.loc)})`);
		}

		yield* this.traverse(n.argument);
	}

	*ReturnStatement(n) {
		if (n.argument) {
			yield I.RETURN_EXPR;
			yield* this.traverse(n.argument);
		} else {
			yield I.RETURN;
		}
	}

	*IfStatement(n) {
		yield n.alternate ? I.IFE : I.IF;
		yield* this.traverse(n.test);
		yield* this.traverse(n.consequent);
		if (n.alternate) yield* this.traverse(n.alternate);
	}

	*SwitchStatement(n) {
		yield I.SWITCH;
		yield* this.traverse(n.discriminant);

		for (const kase of n.cases) {
			if (kase.test) {
				yield* this.traverse(kase.test);
			} else {
				yield I.DEFAULT;
			}

			yield* this.traverse(kase.consequent);
			yield I.END;
		}

		yield I.END;
	}

	*TryStatement(n) {
		yield (
			n.handler
				? n.finalizer
					? I.TRY_CF
					: I.TRY_C
				: I.TRY_F // always at least a C or F
		);

		yield* this.traverse(n.block);
		if (n.handler) {
			yield* this.lookup(n.handler.param.name);
			yield* this.traverse(n.handler.body);
		}
		if (n.finalizer) yield* this.traverse(n.finalizer);
	}

	*ThrowStatement(n) {
		yield I.THROW;
		yield* this.traverse(n.argument);
	}

	*DoWhileStatement(n) {
		yield I.DO;
		yield* this.traverse(n.body);
		yield* this.traverse(n.test);
	}

	*LabeledStatement(n) {
		yield I.LABEL;
		yield* this.lookup(n.label.name);
		yield* this.traverse(n.body);
	}

	*BreakStatement(n) {
		if (n.label) {
			yield I.BREAK_LABEL;
			yield* this.lookup(n.label.name);
		} else {
			yield I.BREAK;
		}
	}

	*ForInStatement(n) {
		yield I.FOR_IN;
		yield* this.traverse(n.left);
		yield* this.traverse(n.right);
		yield* this.traverse(n.body);
	}

	*ContinueStatement(n) {
		if (n.label) {
			yield I.CONTINUE_LABEL;
			yield* this.lookup(n.label.name);
		} else {
			yield I.CONTINUE;
		}
	}

	*NewExpression(n) {
		yield* this.CallExpression(n, I.NEW);
	}
}

function* generateBuffers(source, acornOpts) {
	const ast = acorn.parse(source, {
		ecmaVersion: 'latest',
		locations: true,
		...acornOpts
	});

	const walker = new Walker();

	const chunks = [...walker.traverse(ast)];
	chunks.push(I.END);
	yield Buffer.from(chunks);

	const codeSize = chunks.length;

	const offsetLut = [];

	let total = 0;
	for (const [str, lut] of walker.lookups.entries()) {
		const buf = Buffer.from(str);
		console.log(JSON.stringify(str));
		offsetLut.push(total);
		total += buf.length;
		yield buf;
	}

	yield Buffer.from([I.END]);

	function* generateLutBytes() {
		for (const offset of offsetLut) {
			yield* encodeInt(offset);
		}
	}

	yield Buffer.from([...generateLutBytes()]);
}

function compile(source, acornOpts = {}) {
	const buffers = [];
	let totalLength = 0;

	for (const buffer of generateBuffers(source, acornOpts)) {
		buffers.push(buffer);
		totalLength += buffer.length;
	}

	return Buffer.concat(buffers, totalLength);
}

const Pinch = {
	compile
};

export default Pinch;
