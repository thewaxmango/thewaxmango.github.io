const LAMBDA = "\u03bb";

const Token_ID = {
    T_LPAR: 0,
    T_RPAR: 1,
    T_LAM: 2,
    T_DOT: 3,
    T_VAR: 4
};

class Token {
    constructor(type_id, contents) {
        this.type_id = type_id;
        this.contents = contents;
    }
}

const TOKEN_REGEX = [
    "\\(",
    "\\)",
    "λ|\\^",
    "\\.",
    "[a-zA-Z]+"
];

const AST_ID = {
    A_VAR: 0,
    A_LAM: 1,
    A_APP: 2
};

class AST {
    constructor(type_id, contents) {
        this.type_id = type_id;
        this.contents = contents;
    }

    toString() {
        let s = this.toStrHelper();
        return /^\(.*\)$/.test(s) ? s.slice(1, -1) : s;
    }

    toStrHelper(simple = true) {
        let sc0 = "";
        let sc1 = "";
        switch (this.type_id) {
            case AST_ID.A_VAR:
                return `${this.contents}`;
            case AST_ID.A_LAM:
                sc0 = this.contents[0].toStrHelper();
                sc1 = this.contents[1].toStrHelper();
                sc1 = (simple && /^\(.*\)$/.test(sc1)) ? sc1.slice(1, -1) : sc1;
                return `(λ${sc0}. ${sc1})`;
            case AST_ID.A_APP:
                sc0 = this.contents[0].toStrHelper();
                sc0 = (simple && /^\(.*\)$/.test(sc0) && this.contents[0].type_id === AST_ID.A_APP) ? sc0.slice(1, -1) : sc0;
                sc1 = this.contents[1].toStrHelper();
                return `(${sc0} ${sc1})`;
        }
    }
}

function makeToken(t_id, s) {
    switch (t_id) {
        case Token_ID.T_LPAR:
        case Token_ID.T_RPAR:
        case Token_ID.T_LAM:
        case Token_ID.T_DOT:
            return new Token(t_id, null);
        case Token_ID.T_VAR:
            return new Token(t_id, s);
        default:
            throw new Error(`make_token could not handle Token_ID of value ${t_id}.`);
    }
}

function lexer(input) {
    input = input.replace(/\s+/g, " ").trim();
    const tokenList = [];
    while (input) {
        let flag = false;
        for (let t_id in Token_ID) {
            let mch = input.match(new RegExp("^(" + TOKEN_REGEX[Token_ID[t_id]] + ")"));
            if (!mch) continue;
            if (mch.index !== 0) {
                throw new Error(`Lexer regex matched empty string on "${input}".`);
            }
            tokenList.push(makeToken(Token_ID[t_id], mch[1]));
            input = input.slice(mch[1].length).trim();
            flag = true;
            break;
        }
        if (!flag) {
            throw new Error(`Could not parse token from head of "${input}".`);
        }
    }
    return tokenList;
}

function makeAST(a_id, ...args) {
    switch (a_id) {
        case AST_ID.A_VAR:
            if (typeof args[0] !== "string") {
                throw new Error("Variable AST expected string in argument 0.");
            }
            return new AST(a_id, args[0]);
        case AST_ID.A_LAM:
            if (!(args[0] instanceof AST && args[0].type_id === AST_ID.A_VAR)) {
                throw new Error("Lambda AST expected A_VAR in argument 0.");
            }
            if (!(args[1] instanceof AST)) {
                throw new Error("Lambda AST expected AST in argument 1.");
            }
            return new AST(a_id, [args[0], args[1]]);
        case AST_ID.A_APP:
            if (!(args[0] instanceof AST)) {
                throw new Error("Application AST expected AST in argument 0.");
            }
            if (!(args[1] instanceof AST)) {
                throw new Error("Application AST expected AST in argument 1.");
            }
            return new AST(a_id, [args[0], args[1]]);
        default:
            throw new Error(`make_ast could not handle AST_ID of value ${a_id}.`);
    }
}

function parser(input) {
    function parse(input, all = true) {
        if (input.length === 0) {
            return [null, input];
        }

        switch (input[0].type_id) {
            case Token_ID.T_LPAR: // LParen
                let [capture, c_rem] = parse(input.slice(1));
                if (!capture) {
                    throw new Error(`Failed to find AST within parentheses for token list ${input}.`);
                }
                if (!c_rem[0] || c_rem[0].type_id !== Token_ID.T_RPAR) {
                    throw new Error(`Failed to find matching right parenthesis with enclosed AST for token list ${input}.`);
                }
                
                c_rem = c_rem.slice(1);
                while (c_rem.length && all) {
                    let [arg, a_rem] = parse(c_rem, false);
                    if (!arg) {
                        break;
                    }
                    [capture, c_rem] = [makeAST(AST_ID.A_APP, capture, arg), a_rem];
                }
                return [capture, c_rem];
              
            case Token_ID.T_RPAR: // RParen
                return [null, input];
              
            case Token_ID.T_LAM: // Lambda
                if (!input[1] || input[1].type_id !== Token_ID.T_VAR) {
                    throw new Error(`Failed to find lambda argument for token list ${input}.`);
                }
                if (!input[2] || input[2].type_id !== Token_ID.T_DOT) {
                    throw new Error(`Failed to find lambda dot for token list ${input}.`);
                }
                if (!input[3]) {
                    throw new Error(`Failed to find lambda body for token list ${input}.`);
                }
                
                let [body, b_rem] = parse(input.slice(3));
                return [makeAST(AST_ID.A_LAM, makeAST(AST_ID.A_VAR, input[1].contents), body), b_rem];
              
            case Token_ID.T_VAR: // Variable
                let varAST = makeAST(AST_ID.A_VAR, input[0].contents);
                let v_rem = input.slice(1);
                while (v_rem.length && all) {
                    let [arg, rem] = parse(v_rem, false);
                    if (!arg) {
                        break;
                    }
                    [varAST, v_rem] = [makeAST(AST_ID.A_APP, varAST, arg), rem];
                }
                return [varAST, v_rem];
              
            default:
                throw new Error(`parser could not handle Token_ID ${input[0].type_id}.`);
        }
    }
    return parse(input)[0];
}

function freeVars(input, env = new Set()) {
    switch (input.type_id) {
        case AST_ID.A_VAR:
            if (env.has(input.contents)) {
                return new Set();
            }
            return new Set([input.contents]);
          
        case AST_ID.A_LAM:
            let c = input.contents[0].contents;
            let mark = 0;
            if (!env.has(c)) {
                mark = 1;
                env.add(c);
            }
            let res = freeVars(input.contents[1], env);
            if (mark) {
                env.delete(c);
            }
            return res;
          
        case AST_ID.A_APP:
            return new Set([...freeVars(input.contents[0], env), ...freeVars(input.contents[1], env)]);
          
        default:
            throw new Error(`Alpha-sub could not handle AST_ID ${input.type_id}.`);
    }
}

function alphaSub(input) {
    function sub(input, env = {}) {
        switch (input.type_id) {
            case AST_ID.A_VAR:
                if (env[input.contents] !== undefined) {
                    return makeAST(AST_ID.A_VAR, env[input.contents]);
                }
                return input;
              
            case AST_ID.A_LAM:
                let c = input.contents[0].contents;
                let mark = 0;
                if (env[c] !== undefined) {
                    mark = 1;
                    env[c] += "'";
                } else {
                    mark = 2;
                    env[c] = c;
                }
                let res = makeAST(AST_ID.A_LAM, makeAST(AST_ID.A_VAR, env[c]), sub(input.contents[1], env));
                if (mark === 1) {
                    env[c] = env[c].slice(0, -1);
                } else if (mark === 2) {
                    delete env[c];
                }
                return res;
              
            case AST_ID.A_APP:
                return makeAST(AST_ID.A_APP, sub(input.contents[0], env), sub(input.contents[1], env));
              
            default:
                throw new Error(`Alpha-sub could not handle AST_ID ${input.type_id}.`);
        }
    }
    return sub(input, Object.fromEntries([...freeVars(input)].map(s => [s, s])));
}

let subs = 0;
function reduceAST(input, lazy = false) {
    subs = 0;
    function reduce(input, depth, env = {}) {
        if (parseInt(depth) === 255) {
            throw new Error(`Reduction reached recursion limit (255).`); 
        }
        switch (input.type_id) {
            case AST_ID.A_VAR:
                if (!env[input.contents]) {
                    return input;
                }
                subs += 1;
                return reduce(env[input.contents], parseInt(depth)+1, env);
              
            case AST_ID.A_LAM:
                return makeAST(AST_ID.A_LAM, input.contents[0], reduce(input.contents[1], parseInt(depth)+1, env));
              
            case AST_ID.A_APP:
                let l = reduce(input.contents[0], parseInt(depth) + 1, env);
                if (l.type_id !== AST_ID.A_LAM) {
                    return makeAST(AST_ID.A_APP, l, reduce(input.contents[1], parseInt(depth)+1, env));
                }
                subs += 3;
                let temp = null;
                let c = l.contents[0].contents;
                if (env[c]) {
                    temp = env[c];
                }
                env[c] = lazy ? input.contents[1] : reduce(input.contents[1], parseInt(depth)+1, env);
                let res = reduce(l.contents[1], parseInt(depth)+1, env);
                if (temp !== null) {
                    env[c] = temp;
                } else if (c in env) {
                    delete env[c];
                }
                return res;
              
            default:
                throw new Error(`Reduce could not handle AST_ID ${input.type_id}.`);
        }
    }
    return reduce(input, 0, {});
}

function intToVar(v) {
    const key = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let s = "";
    while (v >= 0) {
        s += key[v % 26];
        v = Math.floor(v / 26);
        if (v <= 0) {
            break;
        }
    }
    return s.split("").reverse().join("");
}

function alphabetize(input, mapping = {}) {
    switch (input.type_id) {
        case AST_ID.A_VAR:
            if (!mapping[input.contents]) {
                mapping[input.contents] = intToVar(Object.keys(mapping).length);
            }
            return makeAST(AST_ID.A_VAR, mapping[input.contents]);
          
        case AST_ID.A_LAM:
            let c = input.contents[0].contents;
            if (!mapping[c]) {
                mapping[c] = intToVar(Object.keys(mapping).length);
            }
            return makeAST(AST_ID.A_LAM, makeAST(AST_ID.A_VAR, mapping[c]), alphabetize(input.contents[1], mapping));
          
        case AST_ID.A_APP:
            return makeAST(AST_ID.A_APP, alphabetize(input.contents[0], mapping), alphabetize(input.contents[1], mapping));
          
        default:
            throw new Error(`Alphabetize could not handle AST_ID ${input.type_id}.`);
    }
}

function gen(depth, boundVars = new Set(), immediateBound = null) {
    const variables = Array.from({ length: parseInt(depth) + 2 }, (_, i) => String.fromCharCode(97 + i));
    const freeVars = Array.from({ length: parseInt(depth) + 1 }, (_, i) => String.fromCharCode(109 + i));

    if (depth === 0) {
        const allVars = [...variables, ...freeVars];
        return allVars[Math.floor(Math.random() * allVars.length)];
    }

    let isAbstraction = 0;
    if (immediateBound) {
        isAbstraction = Math.random() < 0.25;
    } else {
        isAbstraction = Math.random() < 0.4;
    }

    if (isAbstraction) {
        const variable = variables[Math.floor(Math.random() * variables.length)]; // Randomly choose a variable
        const newBoundVars = new Set(boundVars);
        newBoundVars.add(variable);
        const body = gen(depth - 1, newBoundVars, variable);
        return `(λ${variable}.${body})`;
    } else {
        let left, right;
        flag = false;
        if (immediateBound && Math.random() < 0.4) {
            left = immediateBound;
            flag = true;
        } else if (Math.random() < 0.2 && boundVars.size > 0) {
            const boundArray = Array.from(boundVars);
            left = boundArray[Math.floor(Math.random() * boundArray.length)];
        } else if (Math.random() < 0.15) {
            const freeArray = freeVars; 
            left = freeArray[Math.floor(Math.random() * freeArray.length)];
        } else {
            left = gen(depth - 1, boundVars);
        }

        if (immediateBound && Math.random() < 0.25 + (flag ? -0.15 : 0.15)) {
            right = immediateBound;
        } else if (Math.random() < 0.25 && boundVars.size > 0) {
            const boundArray = Array.from(boundVars);
            right = boundArray[Math.floor(Math.random() * boundArray.length)];
        } else if (Math.random() < 0.2) {
            const freeArray = freeVars; 
            right = freeArray[Math.floor(Math.random() * freeArray.length)];
        } else {
            right = gen(depth - 1, boundVars);
        }
        return `(${left} ${right})`;
    }
}
