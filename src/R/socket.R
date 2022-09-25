debug <- function(...) {
  if(interactive() || isTRUE(get0(".debugEnabled", ifnotfound = FALSE))) {
    message(...)
  }
  invisible()
}

createSockerServer <- function(port = 17800) {

  re <- new.env(parent = emptyenv())

  if(missing(port) || !length(port)) {
    port <- 17800L
    succeed <- FALSE
    while(!succeed && port <= 65535L) {
      tryCatch({
        re$socket <- serverSocket(port = port)
        succeed <- TRUE
      }, error = function(e) {
        port <<- port + 1L
      })
    }
  } else {
    port <- as.integer(port)
    re$socket <- serverSocket(port = port)
  }
  re$port <- port
  re$connection_pool <- list()
  re$wrapper_env <- new.env(parent = globalenv())
  re$wrapper_env$.evalEnv <- new.env(parent = re$wrapper_env)
  re$wrapper_env$.resetEnv <- function() {
    genv <- globalenv()
    rm(list = ls(genv), envir = genv)
    re$wrapper_env$.evalEnv <- new.env(parent = re$wrapper_env)
  }
  re$accept_connection <- function(blocking = FALSE, ...) {
    conn <- socketAccept(re$socket, blocking = blocking, ...)
    # re$connection_pool[[length(re$connection_pool) + 1]] <- conn
    re$conn <- conn

  }
  evalExpr <- function(text) {
    msg <- tryCatch(
      {
        utils::capture.output({
          serr <- utils::capture.output({
            eval(parse(text = text), envir = re$wrapper_env$.evalEnv)
          }, type = "message")
          if(length(serr)) {
            cat(serr, sep = "\n")
          }
        })
      },
      error = function(e) {
        c(
          sprintf(
            "Error in %s :",
            paste(utils::capture.output(print(e$call)), collapse = "\n")
          ),
          sprintf(
            "  %s", paste(e$message, collapse = "")
          ),
          "Traceback: ",
          utils::capture.output(traceback(e))
        )
      }
    )
    msg <- paste(msg, collapse = "\n")
    msg
  }
  finalize <- function(re) {
    debug("Closing socket connections")
    close(re$socket)

    for(conn in re$connection_pool) {
      if(!is.null(conn) && inherits(conn, "connection")) {
        try({ close(conn) }, silent = TRUE)
      }
    }
    if( inherits(re$conn, "connection") ) {
      try({ close(re$conn) }, silent = TRUE)
    }
  }

  re$finalize <- function() {
    finalize(re)
  }

  check_pool <- function() {
    n <- length(re$connection_pool)
    if(n > 0) {
      for(ii in seq_along(re$connection_pool)) {
        tryCatch({
          conn <- re$connection_pool[[ii]]
          if(!inherits(conn, "connection")) {
            debug("Closing connection ", ii)
            re$connection_pool[[ii]] <- NULL
          } else if(!isOpen(conn)) {
            debug("Closing connection ", ii)
            re$connection_pool[[ii]] <- NULL
          } else {
            if( isTRUE(attr(conn, "gcReady")) ) {
              print(isIncomplete(conn))
              tmp <- readLines(conn)
              if(length(tmp)) {
                writeLines(tmp, conn)
              } else {
                close(conn)
                debug("Closing connection ", ii)
                re$connection_pool[[ii]] <- NULL
              }
            }
          }
        }, error = function(e) {
          debug("Closing connection ", ii)
          re$connection_pool[[ii]] <- NULL
        })

      }
      n2 <- length(re$connection_pool)
      debug("Current pool size: ", n2)
      # if(n != n2) {
      #   debug("Current pool size: ", n2)
      # }
    }
  }
  re$listen <- function() {
    on.exit({
      finalize(re)
    }, add = TRUE, after = TRUE)

    debug("Start listening...")
    while(TRUE) {

      if(is.null(re$conn)) {
        tryCatch({
          re$accept_connection(timeout = 5)
        }, error = function(e) {
          if(inherits(re$conn, "connection")) {
            try({
              close(re$conn)
            })
          }
          re$conn <- NULL
        })
      }

      if(is.null(re$conn)) {
        check_pool()
        next
      }

      text <- readLines(re$conn)
      text <- trimws(paste(text, collapse = ""))

      if(length(text) && nzchar(text)) {
        debug("Captured command:\n", text, "\n")
        current_connection <- re$conn
        msg <- evalExpr(text)
        writeLines(text = msg, con = current_connection)
        attr(current_connection, "gcReady") <- TRUE
        re$connection_pool[[length(re$connection_pool) + 1]] <- current_connection
        re$conn <- NULL
        Sys.sleep(0.1)
      } else {
        check_pool()
        Sys.sleep(0.5)
      }
    }
    finalize(re)
    return(TRUE)
  }

  reg.finalizer(re, finalize)

  re
}


runSocket <- function(script, port = 17800, timeout = 5) {
  conn = socketConnection(host = "localhost", port = port, server = FALSE,
                          blocking = FALSE, timeout = timeout)
  on.exit({ close(conn) })
  script <- substitute(script)
  script <- utils::capture.output({print(script)})
  writeLines(script, con = conn)
  re <- NULL

  # now <- Sys.time()
  while(length(re <- readLines(conn)) == 0) {
    Sys.sleep(0.1)
    # if(as.numeric(Sys.time() - now, unit = "secs") > timeout) {
    #   break
    # }
  }

  # while(isIncomplete(conn)) {
  #   s <- readLines(conn)
  #   if(length(s)) {
  #     re <- c(re, s)
  #   }
  #   print(re)
  #   Sys.sleep(0.1)
  # }

  return(paste(re, collapse = "\n"))
}

# runSocket({
#   # a <- 1
#   debug(ab)
# })

# server <- createSockerServer(); cat(server$port); server$finalize()
